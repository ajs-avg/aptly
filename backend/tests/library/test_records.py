"""The Library: saving applications, and not losing them.

The behaviour under test is the design doc's central promise — a job post is
taken down within weeks of being filled, and the person still needs the wording
they applied against when a recruiter calls. Everything here is about that
record surviving: the snapshot not drifting, the work following someone from
anonymous into an account, and one person never seeing another's applications.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

JOB_TEXT = """\
Data Engineer — Meridian Analytics (Bengaluru, hybrid)
Build and maintain batch pipelines in Airflow, model data in dbt, and write
performant SQL against large tables. Strong Python required.
"""


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    """A fresh database per test, so one test's records cannot leak into another."""
    monkeypatch.setenv("APTLY_SQLITE_PATH", str(tmp_path / "library.db"))

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


def _save(client: TestClient, **overrides) -> dict:
    payload = {
        "job_text": JOB_TEXT,
        "filename": "cv.docx",
        "source_format": "docx",
        "content_hash": "a" * 64,
        "change_log": [{"node_id": "n1"}, {"node_id": "n2"}],
        **overrides,
    }
    response = client.post("/api/records", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# ═══════════════════════════════════════════════════════════════════════════
# Saving without an account
# ═══════════════════════════════════════════════════════════════════════════


def test_a_stranger_can_save_an_application(client: TestClient) -> None:
    """ "First win before first signup" has to extend to keeping the win."""
    record = _save(client)
    assert record["id"]

    library = client.get("/api/records").json()
    assert library["total_shown"] == 1
    assert library["anonymous"] is True


def test_the_snapshot_records_the_advert_verbatim(client: TestClient) -> None:
    record = _save(client)
    detail = client.get(f"/api/records/{record['id']}").json()

    assert detail["snapshot"]["raw"] == JOB_TEXT
    assert detail["snapshot"]["content_hash"]
    assert detail["snapshot"]["captured_at"]


def test_the_snapshot_hash_is_of_the_advert(client: TestClient) -> None:
    """The hash is what makes the snapshot checkable rather than merely stored."""
    import hashlib

    record = _save(client)
    detail = client.get(f"/api/records/{record['id']}").json()
    assert detail["snapshot"]["content_hash"] == hashlib.sha256(JOB_TEXT.encode()).hexdigest()


def test_the_cv_that_was_sent_is_recorded(client: TestClient) -> None:
    """ "Which CV did I send?" is the question the product exists to answer."""
    record = _save(client)
    detail = client.get(f"/api/records/{record['id']}").json()

    assert len(detail["cv_versions"]) == 1
    version = detail["cv_versions"][0]
    assert version["filename"] == "cv.docx"
    assert version["content_hash"] == "a" * 64
    assert version["change_count"] == 2


# ═══════════════════════════════════════════════════════════════════════════
# Signing up
# ═══════════════════════════════════════════════════════════════════════════


def test_signing_in_brings_your_work_with_you(client: TestClient) -> None:
    """The moment the promise is kept or quietly broken.

    Regression: this reported a successful claim while the Library came back
    empty, because the profile row was created with its own random id while the
    session cookie carried the id derived from the email. The records moved
    somewhere no query looked.
    """
    record = _save(client)

    signed_in = client.post("/api/auth/sign-in", json={"email": "priya@example.com"}).json()
    assert signed_in["signed_in"] is True
    assert signed_in["claimed"] >= 1

    library = client.get("/api/records").json()
    assert library["anonymous"] is False
    assert library["total_shown"] == 1

    detail = client.get(f"/api/records/{record['id']}")
    assert detail.status_code == 200, "the record did not survive sign-in"


def test_signing_in_twice_reaches_the_same_library(client: TestClient) -> None:
    client.post("/api/auth/sign-in", json={"email": "priya@example.com"})
    _save(client)
    client.post("/api/auth/sign-out")
    client.post("/api/auth/sign-in", json={"email": "priya@example.com"})

    assert client.get("/api/records").json()["total_shown"] == 1


def test_one_persons_records_are_invisible_to_another(client: TestClient) -> None:
    """Tenancy is enforced in the repository, so it needs testing there.

    SQLite has no row-level security to fall back on: a query that forgets its
    owner filter shows one applicant another's job search.
    """
    client.post("/api/auth/sign-in", json={"email": "priya@example.com"})
    hers = _save(client)
    client.post("/api/auth/sign-out")

    client.post("/api/auth/sign-in", json={"email": "daniel@example.com"})
    assert client.get("/api/records").json()["total_shown"] == 0
    assert client.get(f"/api/records/{hers['id']}").status_code == 404


def test_a_missing_record_says_so_calmly(client: TestClient) -> None:
    response = client.get(f"/api/records/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["error"]["hint"]


# ═══════════════════════════════════════════════════════════════════════════
# Finding it again
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("term", ["meridian", "MERIDIAN", "airflow", "data engineer"])
def test_search_finds_a_record_by_what_you_remember(client: TestClient, term: str) -> None:
    """Weeks later, all anyone remembers is a phrase from the advert."""
    _save(client, job=_parsed_job())
    assert client.get("/api/records", params={"q": term}).json()["total_shown"] == 1


def test_search_does_not_invent_matches(client: TestClient) -> None:
    _save(client)
    assert client.get("/api/records", params={"q": "kubernetes"}).json()["total_shown"] == 0


def test_records_can_be_filtered_by_status(client: TestClient) -> None:
    record = _save(client)
    client.patch(f"/api/records/{record['id']}", json={"status": "interviewing"})

    assert client.get("/api/records", params={"status": "interviewing"}).json()["total_shown"] == 1
    assert client.get("/api/records", params={"status": "rejected"}).json()["total_shown"] == 0


def test_moving_off_saved_stamps_the_application_date(client: TestClient) -> None:
    record = _save(client)
    assert record["applied_at"] is None

    updated = client.patch(f"/api/records/{record['id']}", json={"status": "applied"}).json()
    assert updated["applied_at"] is not None


def test_notes_survive_a_round_trip(client: TestClient) -> None:
    record = _save(client)
    client.patch(f"/api/records/{record['id']}", json={"notes": "Recruiter: Priya. Called 8 Jul."})

    detail = client.get(f"/api/records/{record['id']}").json()
    assert "Priya" in detail["notes"]


# ═══════════════════════════════════════════════════════════════════════════
# Deleting
# ═══════════════════════════════════════════════════════════════════════════


def test_a_record_can_be_deleted(client: TestClient) -> None:
    record = _save(client)
    assert client.delete(f"/api/records/{record['id']}").status_code == 204
    assert client.get("/api/records").json()["total_shown"] == 0


def test_erase_everything_leaves_nothing(client: TestClient) -> None:
    """The doc promises plain controls to delete everything, and a delete that
    leaves rows behind is worse than none."""
    client.post("/api/auth/sign-in", json={"email": "priya@example.com"})
    _save(client)
    _save(client)

    erased = client.post("/api/records/erase-everything").json()
    assert erased["records"] == 2
    assert erased["cv_versions"] == 2
    assert client.get("/api/records").json()["total_shown"] == 0


def test_erasing_everything_needs_an_account(client: TestClient) -> None:
    _save(client)
    response = client.post("/api/records/erase-everything")
    assert response.status_code == 401
    assert client.get("/api/records").json()["total_shown"] == 1, "nothing should be lost"


# ═══════════════════════════════════════════════════════════════════════════
# Guards
# ═══════════════════════════════════════════════════════════════════════════


def test_the_development_sign_in_refuses_to_run_in_production() -> None:
    """It is a convenience, not authentication, and must never be mistaken for it."""
    from aptly.auth.local import LocalAuth
    from aptly.config import Settings
    from aptly.errors import ConfigurationError

    settings = Settings(APTLY_ENV="production")  # type: ignore[call-arg]
    with pytest.raises(ConfigurationError):
        LocalAuth(settings)


def test_supabase_takes_over_when_its_secret_is_present(monkeypatch) -> None:
    """No code change, no flag — configuring Supabase is what switches it on."""
    from aptly.auth import get_auth
    from aptly.auth.supabase import SupabaseAuth
    from aptly.config import get_settings

    monkeypatch.setenv("SUPABASE_JWT_SECRET", "not-a-real-secret")
    get_settings.cache_clear()
    try:
        assert isinstance(get_auth(), SupabaseAuth)
    finally:
        get_settings.cache_clear()


def _parsed_job() -> dict:
    return {
        "company": "Meridian Analytics",
        "role": "Data Engineer",
        "location": "Bengaluru",
        "keywords": ["Airflow", "dbt", "SQL", "Python"],
        "requirements": [],
        "responsibilities": [],
    }


def test_each_test_gets_its_own_database(client: TestClient) -> None:
    """The fixture points every test at a fresh file.

    Without this the suite passes in isolation and fails when run together, or
    worse, passes together for the wrong reason — one test's records satisfying
    another test's assertions.
    """
    assert client.get("/api/records").json()["total_shown"] == 0
