"""The career profile reaching the tailoring prompt, not just its validator.

The gap this covers was asymmetric and easy to miss. The profile has always
been pooled into `SourceMaterial` on the tailoring path, so a suggestion drawing
on it would survive the no-fabrication check — but it never reached
`tailor_user`, so the model writing those suggestions had never seen it.
Permission without material: the rebuilt CV could use somebody's profile and
the tailored one could not.
"""

from __future__ import annotations

from aptly.llm.prompts import profile_material
from aptly.profile.schemas import (
    Achievement,
    CareerProfile,
    Project,
    Role,
    Skill,
)

CV = """Senior Product Manager, Kalyra
- Cut new-site ramp time from 12 weeks to 6.
SKILLS
Python, SQL
"""


def _profile() -> CareerProfile:
    return CareerProfile(
        roles=[
            Role(
                title="Senior Product Manager",
                company="Kalyra",
                achievements=[
                    Achievement(
                        text="Cut new-site ramp time from 12 weeks to 6.", metric="12w to 6w"
                    ),
                    Achievement(text="Grew the team from 3 to 11 engineers.", metric="3 to 11"),
                ],
            )
        ],
        projects=[Project(name="Atlas", description="Internal routing tool.", outcome="400 users")],
        skills=[Skill(name="Python"), Skill(name="Airflow")],
    )


def _text(profile: CareerProfile, cv: str = CV) -> str:
    return "\n".join(profile_material(profile, cv))


def test_material_the_cv_does_not_have_is_offered() -> None:
    text = _text(_profile())

    assert "Grew the team from 3 to 11" in text
    assert "Atlas" in text
    assert "Airflow" in text


def test_material_the_cv_already_has_is_not_repeated() -> None:
    """The model is holding the CV. Repeating it costs tokens and buries the
    part that is actually new."""
    text = _text(_profile())

    assert text.count("Cut new-site ramp time") == 0
    assert "does not name: Airflow" in text, "Python is on the CV; Airflow is not"


def test_a_metric_travels_with_its_achievement() -> None:
    """The number is the thing that turns a duty into an achievement."""
    assert "[3 to 11]" in _text(_profile())


def test_an_achievement_says_which_job_it_belongs_to() -> None:
    """Without it the model can attach somebody's result to the wrong employer,
    which is a fabrication the validator would not catch — every word is real."""
    assert "Senior Product Manager · Kalyra" in _text(_profile())


def test_the_rules_travel_with_the_material() -> None:
    """It arrives as source material, so it arrives with the same constraints
    the CV does."""
    text = _text(_profile())

    assert "provenance" in text
    assert "never add a figure" in text


def test_no_profile_adds_nothing() -> None:
    assert profile_material(None, CV) == []


def test_an_empty_profile_adds_nothing() -> None:
    """An empty section header with no items under it is noise in the prompt."""
    assert profile_material(CareerProfile(), CV) == []


def test_a_profile_that_only_repeats_the_cv_adds_nothing() -> None:
    profile = CareerProfile(
        roles=[
            Role(
                title="Senior Product Manager",
                company="Kalyra",
                achievements=[Achievement(text="Cut new-site ramp time from 12 weeks to 6.")],
            )
        ],
        skills=[Skill(name="Python")],
    )

    assert profile_material(profile, CV) == []


def test_the_block_is_capped() -> None:
    """A profile with sixty achievements must not crowd out the CV lines that
    are the actual subject of the request."""
    profile = CareerProfile(
        roles=[
            Role(
                title="PM",
                company="Acme",
                achievements=[Achievement(text=f"Did the thing number {i}.") for i in range(60)],
            )
        ]
    )

    items = [line for line in profile_material(profile, CV) if line.startswith("- (")]
    assert len(items) <= 24


def test_the_tailoring_prompt_actually_includes_it() -> None:
    """The whole point: it has to reach the prompt, not merely be renderable."""
    from aptly.ingest import parse_pasted
    from aptly.llm.prompts import tailor_user

    document = parse_pasted(
        "Aman Mishra\naman@example.com\n\nEXPERIENCE\nSenior Product Manager, Kalyra - 2021\n"
        "- Cut new-site ramp time from 12 weeks to 6.\n"
    )
    section = next(s for s in document.sections if s.kind == "experience")

    from aptly.analyse.schemas import JobPost as Post

    prompt = tailor_user(
        section=section,
        job=Post(),
        job_text="",
        editable=[n for n in section.nodes if n.editable],
        profile=_profile(),
        cv_text=document.plain_text(),
    )

    assert "Grew the team from 3 to 11" in prompt
