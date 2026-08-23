"""Health and readiness.

`/health` is a liveness probe — it must never touch the network.
`/ready` reports what is actually wired up, so a half-configured local setup is
obvious at a glance instead of failing three screens later.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from aptly import __version__
from aptly.config import get_settings

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    version: str
    env: str


class Readiness(BaseModel):
    ready: bool
    checks: dict[str, bool]
    missing: list[str]
    env: str = "development"
    #: Which sign-in is in force, in words. A deployment can be `ready` and
    #: still be guarded by a password-less sign-in, and that is worth saying out
    #: loud rather than leaving to be inferred from a boolean.
    auth: str = ""


@router.get("/health", response_model=Health)
async def health() -> Health:
    settings = get_settings()
    return Health(status="ok", version=__version__, env=settings.env)


@router.get("/ready", response_model=Readiness)
async def ready() -> Readiness:
    """What this deployment can actually do.

    Each check asks whether *this process* can do a thing, not whether a
    related setting happens to be present. Two of them used to get that wrong:

    - ``supabase`` required the anon key, which only the browser ever uses. The
      API verifies tokens with either a shared secret or the JWKS endpoint
      derived from the project URL, and needs neither of them to be an anon key.
      A correctly configured API therefore reported itself unready forever.
    - ``auth`` is new, and reports what is actually guarding the Library. The
      development sign-in is email-only with no password, and a deployment
      running on it should say so somewhere a person will look.
    """
    settings = get_settings()
    real_auth = bool(settings.supabase_jwt_secret or settings.supabase_url)

    checks = {
        "gemini_key": bool(settings.gemini_api_key),
        "database": bool(settings.database_url),
        "supabase": real_auth,
    }
    missing = [name for name, ok in checks.items() if not ok]

    return Readiness(
        ready=not missing,
        checks=checks,
        missing=missing,
        env=settings.env,
        auth="supabase" if real_auth else "development sign-in — email only, no password",
    )
