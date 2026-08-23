"""A test client with its own database.

A file per test rather than a shared one: these tests sign in, write a profile
and read it back, and a leaked row from a previous test would make a failure
look like a bug in the endpoint.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("APTLY_SQLITE_PATH", str(tmp_path / "api.db"))

    from aptly.config import get_settings
    from aptly.db import session as db_session

    get_settings.cache_clear()
    db_session.get_engine.cache_clear()
    db_session.get_sessionmaker.cache_clear()

    from aptly.main import app

    with TestClient(app) as test_client:
        yield test_client

    get_settings.cache_clear()
    db_session.get_engine.cache_clear()
    db_session.get_sessionmaker.cache_clear()
