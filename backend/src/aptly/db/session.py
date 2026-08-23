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
        connect_args=_connect_args(url),
    )


#: Supabase's transaction pooler answers on 6543. Matched on the port alone:
#: its *session* pooler shares the same hostname but holds one backend for the
#: whole session, so prepared statements are safe there and disabling them would
#: be a cost paid for nothing.
_TRANSACTION_POOLER_PORT = ":6543"


def _connect_args(url: str) -> dict[str, object]:
    """Driver settings this particular Postgres needs.

    asyncpg prepares every statement it runs, and a connection pooler in
    *transaction* mode hands each statement to whichever backend is free — so
    the prepared statement is created on one connection and executed on
    another, which does not have it. It fails at runtime, under load, with
    "prepared statement __asyncpg_stmt_1__ does not exist" and nothing pointing
    at the pooler.

    Turning the statement cache off is the documented fix. It is applied only
    where it is needed: on a direct or session-mode connection the cache is a
    free win, and giving it up everywhere to accommodate one connection mode
    would be paying for a problem nobody had.
    """
    if _TRANSACTION_POOLER_PORT in url:
        log.info("db.pooler_detected", statement_cache="disabled")
        # `prepared_statement_cache_size` is SQLAlchemy's name for it; asyncpg
        # calls the same thing `statement_cache_size`.
        return {"statement_cache_size": 0, "prepared_statement_cache_size": 0}
    return {}


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

    Always for SQLite and for tests. For Postgres only when
    ``APTLY_DB_AUTO_CREATE`` says so, because a schema owned by both Alembic and
    ``create_all`` is a schema that will eventually disagree with itself.

    The opt-in exists for a first deployment. Alembic is a dependency here but
    carries no migrations yet, so without it a fresh Postgres gets no tables and
    every Library request fails with a 500 that explains nothing.
    """
    settings = get_settings()
    if not settings.is_sqlite and not settings.db_auto_create:
        log.info(
            "db.skipping_create_all",
            reason="set APTLY_DB_AUTO_CREATE=true for a first deploy, or add migrations",
        )
        return

    async with get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    log.info(
        "db.ready",
        url=_redact(settings.resolved_database_url),
        auto_created=not settings.is_sqlite,
    )


async def dispose() -> None:
    await get_engine().dispose()


def _redact(url: str) -> str:
    """Hide the password before a connection string reaches the logs."""
    if "@" not in url:
        return url
    scheme, _, rest = url.partition("://")
    _, _, host = rest.rpartition("@")
    return f"{scheme}://***@{host}"
