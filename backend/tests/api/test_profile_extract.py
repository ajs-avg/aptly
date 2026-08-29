"""Reading a CV into the career profile, and folding it into what is there.

This is the one place in the product where a model writes toward long-term
storage, so the properties under test are the two that keep that safe: it may
not invent, and it may not overwrite what the person typed.
"""

from __future__ import annotations

import pytest
from aptly.profile.extract import merge
from aptly.profile.schemas import (
    Achievement,
    CareerProfile,
    Certification,
    Education,
    Identity,
    Role,
    Skill,
)


def _on_file() -> CareerProfile:
    """A profile somebody has already put work into by hand."""
    return CareerProfile(
        identity=Identity(full_name="Aman Mishra", headline="Product Manager"),
        roles=[
            Role(
                title="Senior Product Manager",
                company="Kalyra",
                start="2021",
                achievements=[
                    Achievement(text="Mentored two juniors into PM roles."),
                ],
            )
        ],
        skills=[Skill(name="Python")],
    )


def _new_cv() -> CareerProfile:
    """The same career, read off a newer CV."""
    return CareerProfile(
        identity=Identity(full_name="Aman Mishra", headline="Senior PM", location="Bengaluru"),
        roles=[
            Role(
                title="Sr. Product Manager",
                company="Kalyra",
                start="2021",
                end="2024",
                achievements=[Achievement(text="Cut ramp time from 12 weeks to 6.")],
                technologies=["SQL"],
            )
        ],
        skills=[Skill(name="Python"), Skill(name="RAG")],
        education=[Education(degree="B.Tech", institution="VIT")],
    )


# ═══════════════════════════════════════════════════════════════════════════
# Nothing the person wrote is lost
# ═══════════════════════════════════════════════════════════════════════════


def test_a_hand_written_achievement_survives_a_new_cv() -> None:
    """The reason merge is the default. Somebody spends ten minutes writing up
    something their CV never mentioned; uploading a newer CV must not take it."""
    merged = merge(_on_file(), _new_cv()).profile

    texts = [a.text for a in merged.roles[0].achievements]
    assert "Mentored two juniors into PM roles." in texts
    assert "Cut ramp time from 12 weeks to 6." in texts


def test_an_existing_value_is_never_overwritten() -> None:
    merged = merge(_on_file(), _new_cv()).profile

    assert merged.identity.headline == "Product Manager"


def test_a_disagreement_is_reported_rather_than_resolved() -> None:
    """Only the person knows which is right, so both are shown."""
    result = merge(_on_file(), _new_cv())

    headline = next(c for c in result.conflicts if c.field == "identity.headline")
    assert headline.existing == "Product Manager"
    assert headline.incoming == "Senior PM"


# ═══════════════════════════════════════════════════════════════════════════
# The new CV still adds what it knows
# ═══════════════════════════════════════════════════════════════════════════


def test_an_empty_field_is_filled() -> None:
    merged = merge(_on_file(), _new_cv()).profile

    assert merged.identity.location == "Bengaluru"
    assert merged.roles[0].end == "2024"


def test_new_skills_education_and_technologies_are_added() -> None:
    merged = merge(_on_file(), _new_cv()).profile

    assert {s.name for s in merged.skills} == {"Python", "RAG"}
    assert [e.institution for e in merged.education] == ["VIT"]
    assert merged.roles[0].technologies == ["SQL"]


def test_it_says_what_it_added() -> None:
    """Otherwise an extraction that worked and an extraction that did nothing
    look identical on screen."""
    added = merge(_on_file(), _new_cv()).added

    assert any("RAG" in item for item in added)
    assert any("Location" in item for item in added)


# ═══════════════════════════════════════════════════════════════════════════
# One career, not two
# ═══════════════════════════════════════════════════════════════════════════


def test_the_same_job_written_differently_is_one_role() -> None:
    """Two CVs a year apart say "Senior Product Manager" and "Sr. Product
    Manager". Treating those as two jobs puts the employer on twice."""
    merged = merge(_on_file(), _new_cv()).profile

    assert len(merged.roles) == 1


def test_a_promotion_at_the_same_employer_stays_two_roles() -> None:
    """The more damaging mistake in the other direction: matching on employer
    alone would collapse a promotion, which is the thing a CV is showing."""
    on_file = CareerProfile(
        roles=[Role(title="Product Manager", company="Kalyra", start="2019", end="2021")]
    )
    incoming = CareerProfile(
        roles=[Role(title="Director of Product", company="Kalyra", start="2021")]
    )

    merged = merge(on_file, incoming).profile

    assert len(merged.roles) == 2


@pytest.mark.parametrize(
    "name", ["AWS Solutions Architect", "aws solutions architect", "AWS  Solutions-Architect"]
)
def test_a_certification_is_not_added_twice(name: str) -> None:
    on_file = CareerProfile(certifications=[Certification(name="AWS Solutions Architect")])
    incoming = CareerProfile(certifications=[Certification(name=name)])

    assert len(merge(on_file, incoming).profile.certifications) == 1


# ═══════════════════════════════════════════════════════════════════════════
# Replace, when it is asked for
# ═══════════════════════════════════════════════════════════════════════════


def test_replacing_starts_from_nothing() -> None:
    """The endpoint models `replace` as a merge into an empty profile, so the
    same code reports what the CV added either way."""
    result = merge(CareerProfile(), _new_cv())

    assert result.profile.identity.headline == "Senior PM"
    assert not result.conflicts


def test_merging_into_an_empty_profile_conflicts_with_nothing() -> None:
    assert merge(CareerProfile(), _new_cv()).conflicts == []


# ═══════════════════════════════════════════════════════════════════════════
# The endpoint
# ═══════════════════════════════════════════════════════════════════════════


def test_extracting_needs_an_account(client) -> None:
    """It writes toward somebody's career history, so there has to be a
    somebody. Ingest and tailor work anonymously; this cannot."""
    response = client.post(
        "/api/profile/extract",
        json={"document": _document(), "mode": "merge"},
    )

    assert response.status_code in (401, 403)


def _document() -> dict:
    from aptly.ingest import parse_pasted

    return parse_pasted(
        "Aman Mishra\naman@example.com\n\nSUMMARY\nA product manager.\n"
    ).model_dump(mode="json")
