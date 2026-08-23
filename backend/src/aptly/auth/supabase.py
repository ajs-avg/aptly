"""Supabase Auth.

Verifies the access token Supabase's client library sends, and maps its user id
onto an Aptly profile. Active as soon as ``SUPABASE_JWT_SECRET`` is set — no
code change, no other configuration.

Supabase signs its access tokens with HS256 using the project's JWT secret,
which is why this needs no asymmetric crypto and no key fetching. If a project
is switched to asymmetric signing keys, this is the file that changes.
"""

from __future__ import annotations

from uuid import UUID, uuid5

import jwt

from aptly.auth.cookies import ANON_COOKIE, CookieSigner
from aptly.config import Settings
from aptly.logging import get_logger

log = get_logger(__name__)

BEARER = "bearer "

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

    def _decode(self, token: str | None) -> dict | None:
        if not token or not self._secret:
            return None
        try:
            return jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                # Supabase stamps this on every access token.
                audience="authenticated",
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
