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


class CookieSigner:
    """Signs and verifies short JSON payloads."""

    def __init__(self, settings: Settings) -> None:
        self._secret = _derive_secret(settings)

    def sign(self, claims: dict[str, str]) -> str:
        body = {**claims, "exp": int(time.time()) + TTL_SECONDS}
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
