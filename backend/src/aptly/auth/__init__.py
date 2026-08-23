"""Who is asking.

Two providers behind one interface, chosen by configuration:

* **Supabase** — verifies the JWT its client library put in the request. Used
  whenever ``SUPABASE_JWT_SECRET`` is set.
* **Local** — a development sign-in that takes an email and issues a signed
  cookie, with no password. It exists so the Library is testable before anyone
  has created a Supabase project, and it **refuses to run in production**.

The rest of the application only ever sees a :class:`Caller`, so swapping
providers later touches this package and nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from aptly.auth.local import LocalAuth
from aptly.auth.supabase import SupabaseAuth
from aptly.config import Settings, get_settings


@dataclass(frozen=True, slots=True)
class Caller:
    """The identity behind one request.

    Anonymous callers are first-class: the product is built so a stranger can
    do the valuable thing before being asked for anything, and they still need
    an owner id for the work they produce.
    """

    #: Whose data this request may touch. For a signed-in person this is their
    #: profile id; for a stranger it is their anonymous session id.
    owner_id: UUID
    #: Stable id from the auth provider, or None when anonymous.
    subject: str | None = None
    email: str | None = None

    @property
    def is_authenticated(self) -> bool:
        return self.subject is not None

    @property
    def usage_key(self) -> str:
        return str(self.owner_id)


class AuthProvider:
    """What every provider must offer."""

    async def identify(self, request) -> Caller | None:  # pragma: no cover - interface
        raise NotImplementedError


def get_auth(settings: Settings | None = None) -> AuthProvider:
    """The provider this deployment is configured for."""
    settings = settings or get_settings()
    if settings.supabase_jwt_secret:
        return SupabaseAuth(settings)
    return LocalAuth(settings)


__all__ = ["AuthProvider", "Caller", "LocalAuth", "SupabaseAuth", "get_auth"]
