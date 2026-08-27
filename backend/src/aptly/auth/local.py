"""Aptly's own sign-in.

The session half of it: a signed cookie, and the derived profile id that makes
signing in twice reach the same records. The credential half — a password,
salted and hashed with scrypt — lives in :mod:`aptly.api.auth`, because
checking one needs the database and this does not.

It began as a development stand-in that took an email and nothing else, and
refused to run in production for the obvious reason. It is a real password
sign-in now and the refusal is gone. What is still a stand-in is account
recovery: without an email step, "forgot password" can only be a reset that
does not prove the address, which is off in production by default.

Supabase remains the better answer where it is available, because it carries
the parts not built here: verified addresses, rate limiting, and the email a
real reset needs.
"""

from __future__ import annotations

from uuid import UUID

from aptly.auth.cookies import (
    ANON_COOKIE,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    CookieSigner,
)
from aptly.config import Settings
from aptly.logging import get_logger

log = get_logger(__name__)

#: Namespace for deriving a stable profile id from an email, so signing in
#: twice reaches the same records.
DEV_NAMESPACE = UUID("8f2b7c4e-1d3a-4b5c-9e6f-0a1b2c3d4e5f")


class LocalAuth:
    """Aptly's own accounts: an email, a password, and a signed-cookie session.

    This used to refuse to start in production, and that refusal was right for
    what it was then — a sign-in that took an email and nothing else, where
    knowing an address was the same as owning the account. There was no version
    of that which belonged on the internet.

    It is a real credential now: a password the person chooses, salted and
    hashed with scrypt, verified in :mod:`aptly.api.auth`. So the ban is lifted,
    and what remains gated is the one part that is still a stand-in — resetting
    a password without proving the address, which is off in production by
    default. See ``Settings.allow_direct_password_reset``.

    Supabase is still the better answer where it is available, because it
    carries the parts not built here: verified addresses, rate limiting, and the
    email that a real password reset needs.
    """

    def __init__(self, settings: Settings) -> None:
        self._signer = CookieSigner(settings)

    def new_session_token(self, email: str, profile_id: UUID) -> str:
        """A signed cookie for somebody the caller has already authenticated.

        Deliberately no longer named `sign_in`, and deliberately no longer the
        thing that decides whether to let somebody in. It used to take an email
        and hand back a session — the whole check — which is why this
        deployment had accounts that anyone could open by typing an address.
        Credentials are verified in the API layer, against a hashed password in
        the database; this only mints the cookie once that has happened.
        """
        return self._signer.sign({"sub": email, "oid": str(profile_id)}, SESSION_TTL_SECONDS)

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
