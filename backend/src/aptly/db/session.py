"""Engine and session management.

One place that knows which database is behind us. Everything above this module
works the same whether that is a local SQLite file or Supabase Postgres.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Any

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
        await connection.run_sync(_add_missing_columns)
    log.info(
        "db.ready",
        url=_redact(settings.resolved_database_url),
        auto_created=not settings.is_sqlite,
    )


def _add_missing_columns(connection: Any) -> None:
    """Add columns the models declare and the tables do not have.

    ``create_all`` creates missing *tables* and is silent about missing
    *columns*, which is the failure mode nobody expects: a database made before
    a column was added keeps working right up until something reads it, and
    then every query against that table fails with a message about SQL rather
    than about the release that changed. A checked-in development database sat
    broken this way for exactly that reason.

    Deliberately narrow. It only ever adds a nullable column, and it never
    drops, renames or retypes one — those are decisions with data loss behind
    them and they belong in a migration a person has read. This is the subset
    that is always safe and that accounts for nearly every schema change a
    young project makes.

    Alembic remains the answer once there is a migration to write; this is what
    keeps the door open until then.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        present = {column["name"] for column in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in present:
                continue
            clause = _default_clause(column)
            if not column.nullable and clause is None:
                # A NOT NULL column with nothing to put in the existing rows
                # cannot be added at all. Say so rather than failing at the next
                # query with something that reads like a driver bug.
                log.warning(
                    "db.column_needs_migration",
                    table=table.name,
                    column=column.name,
                    reason="not nullable and no default to backfill with",
                )
                continue

            ddl = column.type.compile(connection.dialect)
            null = "" if column.nullable else " NOT NULL"
            connection.execute(
                text(
                    f'ALTER TABLE "{table.name}" '
                    f'ADD COLUMN "{column.name}" {ddl}{clause or ""}{null}'
                )
            )
            log.info("db.column_added", table=table.name, column=column.name)


def _default_clause(column: Any) -> str | None:
    """A literal DEFAULT for backfilling existing rows, if one can be derived.

    A `NOT NULL` column needs something to put in the rows that are already
    there, and the models express their defaults in Python — `default=dict` on
    a JSON column — which the database cannot see. Rendering the empty value
    those callables produce is what lets a JSON column be added to a populated
    table, which is the common case here and was otherwise a hand-written
    migration for `{}`.

    Anything less obvious than an empty container or a plain scalar returns
    None, and the caller declines to guess.
    """
    import json

    if column.server_default is not None:
        return ""  # SQLAlchemy renders it as part of the type compilation.

    default = getattr(column.default, "arg", None)
    if default is None:
        return None

    # SQLAlchemy wraps a plain `default=dict` in a function that takes the
    # execution context, so the zero-argument call fails and the one-argument
    # call is the real one. There is no execution context here — the value
    # wanted is what an empty row would get — so `None` is passed for it.
    if callable(default):
        try:
            value = default()
        except TypeError:
            try:
                value = default(None)
            except Exception:
                return None
    else:
        value = default

    if callable(value):
        return None

    if isinstance(value, dict | list):
        return f" DEFAULT '{json.dumps(value)}'"
    if isinstance(value, bool):
        return f" DEFAULT {int(value)}"
    if isinstance(value, int | float):
        return f" DEFAULT {value}"
    if isinstance(value, str):
        return " DEFAULT '{}'".format(value.replace("'", "''"))
    return None


async def dispose() -> None:
    await get_engine().dispose()


def _redact(url: str) -> str:
    """Hide the password before a connection string reaches the logs."""
    if "@" not in url:
        return url
    scheme, _, rest = url.partition("://")
    _, _, host = rest.rpartition("@")
    return f"{scheme}://***@{host}"
