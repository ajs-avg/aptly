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


@router.get("/health", response_model=Health)
async def health() -> Health:
    settings = get_settings()
    return Health(status="ok", version=__version__, env=settings.env)


@router.get("/ready", response_model=Readiness)
async def ready() -> Readiness:
    settings = get_settings()
    checks = {
        "gemini_key": bool(settings.gemini_api_key),
        "database": bool(settings.database_url),
        "supabase": bool(settings.supabase_url and settings.supabase_anon_key),
    }
    missing = [name for name, ok in checks.items() if not ok]
    return Readiness(ready=not missing, checks=checks, missing=missing)
