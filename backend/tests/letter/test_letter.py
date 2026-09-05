"""The cover letter — held to the same rule as every other line.

The interesting property is the placeholders: a generator that cannot know the
hiring manager's name either invents one or writes a blank. This one writes
blanks, and the tests pin both the honesty and the shape the browser fills.
"""

from __future__ import annotations

from aptly.ingest import parse_pasted
from aptly.letter import LETTER_SYSTEM, CoverLetter, Placeholder, _addressee, letter_user
from aptly.validate import SourceMaterial, unsupported_claims

CV = """Aman Mishra
aman@example.com | +91 98765 43210

SUMMARY
Product manager with six years across hardware and software launches.

EXPERIENCE
Senior Product Manager, Kalyra - Jan 2021 to Dec 2024
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.
"""

JOB = "Product Manager — Growth at TechNova Solutions.\nOwn onboarding and activation.\nRun discovery.\nB2B SaaS required."


def test_the_prompt_demands_placeholders_over_guesses() -> None:
    assert "[[double-bracketed label]]" in LETTER_SYSTEM
    assert "Do not invent them" in LETTER_SYSTEM


def test_the_prompt_carries_the_one_rule() -> None:
    """The advert is emphasis, never evidence — the same line the whole
    product is built on, restated where a letter is written."""
    assert "never \
evidence about them" in LETTER_SYSTEM.replace("\n", " ") or "never evidence" in LETTER_SYSTEM


def test_the_schema_is_one_gemini_will_accept() -> None:
    from google.genai import Client
    from google.genai import _transformers as transformers

    client = Client(api_key="x" * 20)
    transformers.t_schema(client._api_client, CoverLetter)


def test_the_job_post_reaches_the_prompt_and_the_cv_does_too() -> None:
    document = parse_pasted(CV)
    prompt = letter_user(document=document, job_text=JOB, profile=None)

    assert "TechNova" in prompt
    assert "ramp time" in prompt


def test_the_addressee_is_only_the_advert_opening() -> None:
    """The company's name may be written; the advert's wish list may not.
    Only the opening lines cross, so 'B2B SaaS required' three lines down
    still cannot be laundered into somebody's history."""
    head = _addressee("TechNova Solutions\nProduct Manager\n" + "Kubernetes required\n" * 40)

    assert "TechNova" in head
    assert len(head) <= 400


def test_a_letter_naming_the_employer_passes_the_check() -> None:
    document = parse_pasted(CV)
    source = SourceMaterial.build(document, None, extra=_addressee(JOB))

    letter = (
        "Dear [[Hiring manager's name]],\n\n"
        "I am applying for the Product Manager role at TechNova Solutions. "
        "At Kalyra I cut new-site ramp time from 12 weeks to 6 by rebuilding "
        "the onboarding flow.\n\nAman Mishra"
    )
    body = letter.replace("[[Hiring manager's name]]", " ")

    assert unsupported_claims(body, source) is None


def test_an_invented_skill_in_a_letter_is_still_caught() -> None:
    document = parse_pasted(CV)
    source = SourceMaterial.build(document, None, extra=_addressee(JOB))

    assert unsupported_claims("I have deployed Kubernetes at scale.", source) is not None


def test_placeholder_shape_round_trips() -> None:
    parsed = CoverLetter(
        letter="Dear [[Hiring manager's name]], …",
        placeholders=[
            Placeholder(token="[[Hiring manager's name]]", label="Hiring manager's name")
        ],
    )

    assert parsed.placeholders[0].token in parsed.letter
