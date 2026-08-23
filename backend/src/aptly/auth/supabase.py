"""Supabase Auth.

Verifies the access token Supabase's client library sends, and maps its user id
onto an Aptly profile.

**Two signing schemes, because Supabase has two.** Projects created before the
change sign access tokens with HS256 and a shared secret. Newer ones — and any
project that has migrated — use asymmetric keys, ES256 by default, and publish
the public half at a JWKS endpoint. A verifier that knows only about the shared
secret rejects every token from an asymmetric project, and does it *silently*:
the request simply arrives as an anonymous visitor, so the person signs in
successfully and then finds an empty Library with no error anywhere.

So both are supported and the token itself decides which is used — its header
names the algorithm, and for an asymmetric one the ``kid`` names the key. That
also means a project can migrate without a redeploy, and can keep working
through the period where both key types are live.
"""

from __future__ import annotations

from uuid import UUID, uuid5

import jwt
from jwt import PyJWKClient

from aptly.auth.cookies import ANON_COOKIE, CookieSigner
from aptly.config import Settings
from aptly.logging import get_logger

log = get_logger(__name__)

BEARER = "bearer "

#: What Supabase stamps on every access token.
_AUDIENCE = "authenticated"

#: The asymmetric algorithms Supabase offers. Listed explicitly rather than
#: accepting whatever the token asks for: a verifier that trusts the token's own
#: `alg` header will happily accept `none`, or accept an HS256 token signed with
#: the *public* key it was told to trust.
_ASYMMETRIC = ("ES256", "RS256")

#: Namespace for deriving an Aptly owner id from a Supabase user id when the
#: profile row does not exist yet. Deterministic, so the same user always maps
#: to the same id even before their first write.
_SUPABASE_NAMESPACE = UUID("3c9e6f2a-7b1d-4e8c-a5f0-2d4b6c8e0a13")


class SupabaseAuth:
    """Reads the caller from a Supabase access token."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._secret = settings.supabase_jwt_secret
        self._signer = CookieSigner(settings)
        self._jwks: PyJWKClient | None = None

    # ── keys ─────────────────────────────────────────────────────────────

    @property
    def jwks_url(self) -> str:
        """Where this project publishes its public signing keys."""
        base = self._settings.supabase_url.rstrip("/")
        return f"{base}/auth/v1/.well-known/jwks.json" if base else ""

    def _keys(self) -> PyJWKClient | None:
        """The JWKS client, built on first use and then reused.

        Lazy on purpose. Building it eagerly would put a network call in the
        constructor, which runs during request handling — one slow DNS lookup
        would then stall a request rather than a background refresh.

        ``PyJWKClient`` caches what it fetches and re-fetches when it is asked
        for a ``kid`` it has not seen, which is exactly what key rotation looks
        like from here.
        """
        if not self.jwks_url:
            return None
        if self._jwks is None:
            self._jwks = PyJWKClient(self.jwks_url, cache_keys=True, lifespan=600)
        return self._jwks

    # ── the request ──────────────────────────────────────────────────────

    def new_anon_token(self, anon_id: UUID) -> str:
        return self._signer.sign({"anon": str(anon_id)})

    async def identify(self, request):
        from aptly.auth import Caller

        claims = self._decode(_bearer_token(request)) or {}
        if subject := claims.get("sub"):
            return Caller(
                owner_id=_owner_id(subject),
                subject=subject,
                email=claims.get("email"),
            )

        # Supabase has nothing to say about a visitor who has not signed in, and
        # that visitor is the one this product is designed around. The anonymous
        # cookie is ours in both modes.
        anon = self._signer.verify(request.cookies.get(ANON_COOKIE))
        if anon and (value := anon.get("anon")):
            return Caller(owner_id=UUID(value))

        return None

    # ── verification ─────────────────────────────────────────────────────

    def _decode(self, token: str | None) -> dict | None:
        if not token:
            return None

        try:
            algorithm = jwt.get_unverified_header(token).get("alg", "")
        except jwt.InvalidTokenError as exc:
            log.warning("auth.token_malformed", error=str(exc)[:120])
            return None

        # The header only *selects* a verifier; it never grants trust. Each
        # branch below pins the algorithms it will accept, so a token cannot
        # nominate one whose key we hold for a different purpose.
        if algorithm in _ASYMMETRIC:
            return self._decode_asymmetric(token)
        if algorithm == "HS256":
            return self._decode_shared_secret(token)

        log.warning("auth.token_unsupported_alg", alg=algorithm[:20])
        return None

    def _decode_asymmetric(self, token: str) -> dict | None:
        keys = self._keys()
        if keys is None:
            log.warning(
                "auth.jwks_unconfigured",
                hint="set SUPABASE_URL — this project signs tokens with asymmetric keys",
            )
            return None

        try:
            signing_key = keys.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=list(_ASYMMETRIC),
                audience=_AUDIENCE,
            )
        except jwt.ExpiredSignatureError:
            log.info("auth.token_expired")
        except jwt.InvalidTokenError as exc:
            log.warning("auth.token_invalid", error=str(exc)[:120])
        except Exception as exc:
            # A JWKS fetch failure is an outage on their side, not a bad token.
            # Logged loudly because it makes everybody look signed out.
            log.error("auth.jwks_unreachable", url=self.jwks_url, error=str(exc)[:160])
        return None

    def _decode_shared_secret(self, token: str) -> dict | None:
        if not self._secret:
            log.warning(
                "auth.secret_unconfigured",
                hint="set SUPABASE_JWT_SECRET — this project signs tokens with HS256",
            )
            return None
        try:
            return jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience=_AUDIENCE,
            )
        except jwt.ExpiredSignatureError:
            log.info("auth.token_expired")
        except jwt.InvalidTokenError as exc:
            log.warning("auth.token_invalid", error=str(exc)[:120])
        return None


def _bearer_token(request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith(BEARER):
        return header[len(BEARER) :].strip()
    return None


def _owner_id(subject: str) -> UUID:
    """Supabase user ids are already UUIDs; anything else is hashed into one."""
    try:
        return UUID(subject)
    except ValueError:
        return uuid5(_SUPABASE_NAMESPACE, subject)
