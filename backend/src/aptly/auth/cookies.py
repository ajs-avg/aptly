"""Signed cookies.

Both providers need the same thing: a tamper-evident cookie holding an
anonymous session id. Supabase owns *authentication*, but it has nothing to say
about a visitor who has not signed in — and that visitor is the one the product
is designed around.

So the anonymous cookie is ours in both modes, and lives here rather than being
reached into from the Supabase provider.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode

from aptly.config import Settings

SESSION_COOKIE = "aptly_session"
ANON_COOKIE = "aptly_anon"

#: A week, matching how long anonymous work is kept before it is purged.
TTL_SECONDS = 7 * 24 * 3600

#: How long a *signed-in* session lasts.
#:
#: Longer than the anonymous one because it is answering a different question.
#: Seven days is how long we keep work belonging to nobody; this is how long
#: somebody stays signed in, and being asked to sign in again every week is the
#: complaint, not the feature. Renewed on use — see :func:`should_renew` — so
#: anyone who visits within thirty days never sees a sign-in screen again.
SESSION_TTL_SECONDS = 30 * 24 * 3600

#: Renew a cookie once it is more than this far through its life.
#:
#: Not on every request: `Set-Cookie` on every response defeats caching and
#: writes a header nobody needed. Not never, either — a fixed expiry signs out
#: somebody who has been using the product daily for a month, which is the exact
#: person who should never see a sign-in screen.
RENEW_AFTER_FRACTION = 0.5


def cookie_policy(settings: Settings) -> dict[str, object]:
    """How a cookie must be marked to survive the trip back.

    The deployed topology is two hosts — `aptly-web.onrender.com` and
    `aptly-api.onrender.com`. `onrender.com` is on the Public Suffix List, so
    those are not merely different origins, they are different *sites*, and a
    `SameSite=Lax` cookie is not sent on a cross-site `fetch` at all.

    That is why signing in stopped sticking in production while working
    perfectly on a laptop, where `localhost:3000` and `localhost:8000` differ
    only by port and are same-site. The cookie was set, acknowledged, and then
    never sent again — so the next request looked like a new visitor, and the
    person was asked to sign in once more.

    `SameSite=None` is what a cross-site cookie has to say, and browsers only
    accept it with `Secure`, which is why the two move together here rather than
    being decided separately at each call site.
    """
    cross_site = settings.is_deployed
    return {
        "httponly": True,
        "samesite": "none" if cross_site else "lax",
        "secure": cross_site,
        "path": "/",
    }


def should_renew(expires_at: float, ttl: int) -> bool:
    """Is this cookie far enough through its life to be worth re-issuing?"""
    remaining = expires_at - time.time()
    return remaining < ttl * RENEW_AFTER_FRACTION


class CookieSigner:
    """Signs and verifies short JSON payloads."""

    def __init__(self, settings: Settings) -> None:
        self._secret = _derive_secret(settings)

    def sign(self, claims: dict[str, str], ttl: int = TTL_SECONDS) -> str:
        body = {**claims, "exp": int(time.time()) + ttl}
        raw = _b64(json.dumps(body, separators=(",", ":")).encode())
        signature = _b64(hmac.new(self._secret, raw.encode(), hashlib.sha256).digest())
        return f"{raw}.{signature}"

    def verify(self, token: str | None) -> dict[str, str] | None:
        if not token or "." not in token:
            return None
        raw, _, signature = token.partition(".")

        expected = _b64(hmac.new(self._secret, raw.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None

        try:
            payload = json.loads(_unb64(raw))
        except (ValueError, TypeError):
            return None

        if payload.get("exp", 0) < time.time():
            return None
        return payload


def _derive_secret(settings: Settings) -> bytes:
    """A per-deployment signing key.

    Derived from configuration rather than asked for, because in development
    this protects nothing more than an anonymous session id. In production the
    Supabase JWT secret is already a real secret and is mixed in, so the cookie
    is not forgeable by someone who merely knows the database host.
    """
    material = "::".join(
        [
            "aptly-cookies",
            settings.env,
            settings.supabase_jwt_secret,
            settings.resolved_database_url,
        ]
    )
    return hashlib.sha256(material.encode()).digest()


def _b64(data: bytes) -> str:
    return urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(data: str) -> bytes:
    return urlsafe_b64decode(data + "=" * (-len(data) % 4))
