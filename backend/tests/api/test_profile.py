"""The career profile endpoint.

The profile is what lets a freely-rebuilt CV be detailed without inventing
anything, so these cover the two properties that matter: it survives a round
trip, and what the person typed reaches the no-fabrication checker.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.profile.schemas import Achievement, CareerProfile, Identity, Role, Skill
from aptly.validate import SourceMaterial
from fastapi.testclient import TestClient


def _account(client, email: str):
    """Sign in, creating the account on first sight.

    These tests are about ownership and claiming rather than about credentials,
    so they want "be this person" in one line. Sign-up is the call that does it;
    a second visit for the same address is a sign-in.
    """
    password = f"passphrase-for-{email}"
    created = client.post(
        "/api/auth/sign-up",
        json={"name": email.split("@")[0].title(), "email": email, "password": password},
    )
    if created.status_code == 200:
        return created
    return client.post("/api/auth/sign-in", json={"email": email, "password": password})


CV = """\
Rahul Menon
rahul.menon@example.com | Bengaluru

WORK EXPERIENCE
Frontend Developer, Kalyra Commerce — 2022 to present
- Built the internal pricing dashboard.
"""

FILLED = CareerProfile(
    identity=Identity(
        full_name="Rahul Menon",
        headline="Frontend developer",
        email="rahul.menon@example.com",
        summary="Three years building customer-facing web applications.",
    ),
    roles=[
        Role(
            title="Frontend Developer",
            company="Kalyra Commerce",
            start="2022",
            is_current=True,
            technologies=["React", "PostgreSQL"],
            achievements=[
                Achievement(
                    text="Rebuilt the checkout flow",
                    metric="conversion up 4 points",
                    skills_used=["React"],
                )
            ],
        )
    ],
    skills=[Skill(name=name) for name in ("React", "SQL", "Python", "TypeScript", "PostgreSQL")],
)


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    response = _account(client, "rahul@example.com")
    assert response.status_code == 200
    return client


# ═══════════════════════════════════════════════════════════════════════════
# Round trip
# ═══════════════════════════════════════════════════════════════════════════


def test_a_new_person_gets_an_empty_profile_not_an_error(signed_in: TestClient) -> None:
    """An unfilled profile is a normal state, not a missing resource."""
    response = signed_in.get("/api/profile")

    assert response.status_code == 200
    body = response.json()
    assert body["completeness"] == 0
    assert body["next_steps"], "an empty profile should say what to fill in first"


def test_the_profile_survives_a_round_trip(signed_in: TestClient) -> None:
    saved = signed_in.put("/api/profile", json=FILLED.model_dump(mode="json"))
    assert saved.status_code == 200

    read = signed_in.get("/api/profile").json()
    profile = CareerProfile.model_validate(read["profile"])

    assert profile.identity.full_name == "Rahul Menon"
    assert profile.roles[0].achievements[0].metric == "conversion up 4 points"
    assert read["completeness"] > 50


def test_a_put_replaces_rather_than_merges(signed_in: TestClient) -> None:
    """Otherwise a deleted role reappears from the stored copy on next load."""
    signed_in.put("/api/profile", json=FILLED.model_dump(mode="json"))

    trimmed = FILLED.model_copy(update={"roles": []})
    signed_in.put("/api/profile", json=trimmed.model_dump(mode="json"))

    profile = CareerProfile.model_validate(signed_in.get("/api/profile").json()["profile"])
    assert profile.roles == []


def test_it_needs_an_account(client: TestClient) -> None:
    """Ingest and tailor work anonymously because they store nothing. This stores."""
    assert client.get("/api/profile").status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
# What it is for
# ═══════════════════════════════════════════════════════════════════════════


def test_profile_facts_become_checkable_source_material() -> None:
    """The point of the whole feature.

    A rebuild may use "conversion up 4 points" only because the person typed it
    here — the uploaded CV never mentions it. Widening the evidence base is what
    lets a rebuilt CV be fuller without a single invented sentence.
    """
    document = parse_pasted(CV)

    without = SourceMaterial.build(document)
    with_profile = SourceMaterial.build(document, profile_text=FILLED.as_source_text())

    assert not without.knows("checkout")
    assert with_profile.knows("checkout")
    assert "conversion up 4 points" in with_profile.text


def test_an_empty_profile_widens_nothing() -> None:
    """No profile must not mean a looser rule — it means the same rule, less material."""
    document = parse_pasted(CV)

    baseline = SourceMaterial.build(document)
    empty = SourceMaterial.build(document, profile_text=CareerProfile().as_source_text())

    assert empty.vocabulary == baseline.vocabulary
