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


#: Response headers the browser is allowed to read cross-origin.
#:
#: Not covered by ``allow_headers``, which is about the *request*. Without this
#: list, JavaScript on another origin sees only the six CORS-safelisted response
#: headers and every one of these reads back as ``null`` — with no error, which
#: is what made it so hard to see.
#:
#: It broke the download outright. The export names the file in
#: ``Content-Disposition``; unable to read it, the browser fell back to the
#: document's *source* filename, so choosing Word saved .docx bytes under a
#: .txt name and the person opened a page of binary. The two ``X-Aptly``
#: headers failed more quietly: a rebuilt document is meant to say so, and
#: never did.
EXPOSED_HEADERS = ["Content-Disposition", "X-Aptly-Rebuilt", "X-Aptly-Notes"]

app.add_middleware(
    CORSMiddleware,
    # Logged at import, because a browser cannot tell a refused origin from an
    # unreachable server — both surface as a bare network failure — so a wrong
    # value here is otherwise invisible from either side.
    allow_origins=_log_origins(_settings.cors_origin_list),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=EXPOSED_HEADERS,
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
