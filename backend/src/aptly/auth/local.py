"""Development sign-in.

Enough identity to build and test the Library before a Supabase project exists:
you give it an email, it gives you a signed cookie. No password, no email
verification, no account recovery.

That is obviously not authentication, which is why it **refuses to start in
production**. The value is that everything above it — profiles, ownership,
claiming anonymous work, the Library itself — is written once against a real
identity and does not change when Supabase arrives.
"""

from __future__ import annotations

from uuid import UUID, uuid5

from aptly.auth.cookies import (
    ANON_COOKIE,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    CookieSigner,
)
from aptly.config import Settings
from aptly.errors import ConfigurationError
from aptly.logging import get_logger

log = get_logger(__name__)

#: Namespace for deriving a stable profile id from an email in development, so
#: signing in twice reaches the same records.
_DEV_NAMESPACE = UUID("8f2b7c4e-1d3a-4b5c-9e6f-0a1b2c3d4e5f")


class LocalAuth:
    """Signed-cookie sessions for local development only."""

    def __init__(self, settings: Settings) -> None:
        if settings.is_production:
            raise ConfigurationError(
                "The development sign-in cannot run in production.",
                hint="Set SUPABASE_JWT_SECRET so Aptly uses Supabase Auth, "
                "or set APTLY_ENV to something other than production.",
            )
        self._signer = CookieSigner(settings)

    def sign_in(self, email: str) -> tuple[str, UUID]:
        """Issue a session for an email. Returns the cookie value and profile id."""
        email = email.strip().lower()
        if "@" not in email or len(email) < 5:
            raise ConfigurationError(
                "That does not look like an email address.",
                hint="In development any address works — try you@example.com.",
            )
        owner_id = uuid5(_DEV_NAMESPACE, email)
        log.info("auth.local_sign_in", email=email, profile_id=str(owner_id))
        return (
            self._signer.sign({"sub": email, "oid": str(owner_id)}, SESSION_TTL_SECONDS),
            owner_id,
        )

    def new_anon_token(self, anon_id: UUID) -> str:
        return self._signer.sign({"anon": str(anon_id)})

    async def identify(self, request):
        from aptly.auth import Caller

        payload = self._signer.verify(request.cookies.get(SESSION_COOKIE))
        if payload and (subject := payload.get("sub")) and (owner := payload.get("oid")):
            return Caller(owner_id=UUID(owner), subject=subject, email=subject)

        anon = self._signer.verify(request.cookies.get(ANON_COOKIE))
        if anon and (value := anon.get("anon")):
            return Caller(owner_id=UUID(value))

        return None
