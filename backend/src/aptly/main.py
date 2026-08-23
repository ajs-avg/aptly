"""Aptly API entrypoint.

Run locally:
    uv run uvicorn aptly.main:app --reload --port 8000
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aptly import __version__
from aptly.api import auth, cv, health, profile, records, tailor
from aptly.config import get_settings
from aptly.db.session import create_all, dispose
from aptly.errors import AptlyError
from aptly.logging import configure_logging, get_logger

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    settings = get_settings()
    log.info(
        "aptly.starting",
        env=settings.env,
        version=__version__,
        model_main=settings.gemini_model_main,
        model_fast=settings.gemini_model_fast,
    )
    # Creates the SQLite schema on first run so the app works with no setup.
    # A Postgres deployment is managed by Alembic and this is a no-op there.
    await create_all()

    yield
    await dispose()
    log.info("aptly.stopping")


app = FastAPI(
    title="Aptly API",
    description="Tailor every application. Be ready when they call.",
    version=__version__,
    lifespan=lifespan,
)

_settings = get_settings()


def _log_origins(origins: list[str]) -> list[str]:
    get_logger(__name__).info("cors.configured", origins=origins)
    return origins


app.add_middleware(
    CORSMiddleware,
    # Logged at import, because a browser cannot tell a refused origin from an
    # unreachable server — both surface as a bare network failure — so a wrong
    # value here is otherwise invisible from either side.
    allow_origins=_log_origins(_settings.cors_origin_list),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AptlyError)
async def _aptly_error_handler(request: Request, exc: AptlyError) -> JSONResponse:
    """Errors say what happened and how to fix it, calmly. (Design doc, p.9)"""
    log.warning("aptly.error", code=exc.code, detail=exc.detail, path=request.url.path)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.detail, "hint": exc.hint}},
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(cv.router)
app.include_router(tailor.router)
app.include_router(records.router)
app.include_router(profile.router)
