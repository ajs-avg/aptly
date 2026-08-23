"""Engine and session management.

One place that knows which database is behind us. Everything above this module
works the same whether that is a local SQLite file or Supabase Postgres.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from aptly.config import get_settings
from aptly.db.models import Base
from aptly.logging import get_logger

log = get_logger(__name__)


@lru_cache
def get_engine() -> AsyncEngine:
    """The process-wide engine."""
    settings = get_settings()
    url = settings.resolved_database_url

    if settings.is_sqlite:
        # An in-memory SQLite database exists only for as long as its
        # connection does, so tests need every session to share one. A file
        # database does not, but the same settings are harmless there.
        return create_async_engine(
            url,
            echo=False,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if ":memory:" in url else None,
        )

    return create_async_engine(
        url,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,  # Supabase closes idle connections; reconnect quietly.
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        get_engine(),
        expire_on_commit=False,  # let handlers read a model after commit
        autoflush=False,
    )


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """A transaction that commits on success and rolls back on anything else."""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    async with session_scope() as session:
        yield session


async def create_all() -> None:
    """Create any missing tables.

    Used for SQLite and for tests. Postgres is managed by Alembic — running
    ``create_all`` against a database with a migration history would leave the
    two disagreeing about what the schema is.
    """
    settings = get_settings()
    if not settings.is_sqlite:
        log.info("db.skipping_create_all", reason="use alembic for postgres")
        return

    async with get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    log.info("db.ready", url=_redact(settings.resolved_database_url))


async def dispose() -> None:
    await get_engine().dispose()


def _redact(url: str) -> str:
    """Hide the password before a connection string reaches the logs."""
    if "@" not in url:
        return url
    scheme, _, rest = url.partition("://")
    _, _, host = rest.rpartition("@")
    return f"{scheme}://***@{host}"
