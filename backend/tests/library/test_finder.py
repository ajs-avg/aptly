"""Who is calling?

The Library's promise is being ready when they call, and the first thing a
call needs is the right record. These test the finder's first layer — the
deterministic one — against the ways people actually describe a caller.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.library.test_records import _account, _save, client  # noqa: F401 — the fixture


@pytest.fixture(autouse=True)
def no_model(monkeypatch) -> None:
    """The first layer alone. The model is for close calls, and costs money."""

    def refuse(*args, **kwargs):
        raise RuntimeError("no model in tests")

    monkeypatch.setattr("aptly.api.records.GeminiClient", refuse)


def _library(client: TestClient) -> dict[str, str]:
    _account(client, "caller@example.com")
    ids = {}
    ids["meridian"] = _save(
        client,
        job_text="Data Engineer — Meridian Analytics (Bengaluru, hybrid)\nAirflow, dbt, SQL.",
        job={"company": "Meridian Analytics", "role": "Data Engineer", "location": "Bengaluru", "keywords": ["Airflow", "dbt", "SQL"]},
    )["id"]
    ids["northwind"] = _save(
        client,
        job_text="Data Analyst — Northwind Health (Pune)\nSQL, Power BI, Excel.",
        job={"company": "Northwind Health Pvt Ltd", "role": "Data Analyst", "location": "Pune", "keywords": ["SQL", "Power BI"]},
    )["id"]
    ids["acme"] = _save(
        client,
        job_text="Senior Product Manager — Acme Robotics (Remote)\nHardware launches.",
        job={"company": "Acme Robotics", "role": "Senior Product Manager", "location": "Remote", "keywords": ["Hardware"]},
    )["id"]
    return ids


def _find(client: TestClient, query: str) -> dict:
    response = client.post("/api/records/find", json={"query": query})
    assert response.status_code == 200, response.text
    return response.json()


def test_a_company_fragment_and_a_role_find_the_record(client: TestClient) -> None:
    ids = _library(client)
    result = _find(client, "Priya from Meridian about the data engineer role")
    assert result["best"]["record"]["id"] == ids["meridian"]
    assert result["confidence"] == "sure"
    assert any(why.startswith("company:") for why in result["best"]["why"])


def test_hinglish_finds_the_record(client: TestClient) -> None:
    ids = _library(client)
    result = _find(client, "yeh aadmi northwind se bol raha hai analyst wali post ke liye")
    assert result["best"]["record"]["id"] == ids["northwind"]
    assert result["confidence"] == "sure"


def test_a_misspelt_company_still_finds_it(client: TestClient) -> None:
    ids = _library(client)
    result = _find(client, "someone from meridain, data role")
    assert result["best"]["record"]["id"] == ids["meridian"]
    assert result["confidence"] in {"sure", "likely"}


def test_a_name_in_the_notes_finds_it(client: TestClient) -> None:
    ids = _library(client)
    client.patch(f"/api/records/{ids['northwind']}", json={"notes": "Recruiter: Priya Nair, follow up Monday"})
    result = _find(client, "priya called")
    assert result["best"]["record"]["id"] == ids["northwind"]
    assert any("notes" in why for why in result["best"]["why"])


def test_the_company_suffix_does_not_matter(client: TestClient) -> None:
    ids = _library(client)
    result = _find(client, "northwind health")
    assert result["best"]["record"]["id"] == ids["northwind"]


def test_nothing_matching_says_so(client: TestClient) -> None:
    _library(client)
    result = _find(client, "zomato, delivery partner")
    assert result["best"] is None
    assert result["confidence"] == "none"
    assert result["others"] == []


def test_runners_up_are_listed(client: TestClient) -> None:
    ids = _library(client)
    result = _find(client, "data analyst, bengaluru")
    shown = {result["best"]["record"]["id"], *(c["record"]["id"] for c in result["others"])}
    assert ids["meridian"] in shown and ids["northwind"] in shown
    assert result["best"]["record"]["id"] in {ids["meridian"], ids["northwind"]}


def test_a_stranger_can_ask_too(client: TestClient) -> None:
    """Anonymous records are searchable by their own session."""
    _save(client, job={"company": "Orbit Labs", "role": "QA Engineer"})
    result = _find(client, "orbit labs")
    assert result["best"]["record"]["company"] == "Orbit Labs"
