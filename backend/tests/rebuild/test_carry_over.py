"""Nothing true about the person disappears from a rebuild.

The rebuild prompt hands the model the whole document to design — which
sections it has, what order, what earns space. That is right for the parts of a
CV that make an argument and wrong for the parts that state a fact: a
certification is held or it is not, and a model deciding it "does not earn
space against this job" is silent data loss. Nobody reads a rebuilt CV line by
line against the original to catch it.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.rebuild import FACTUAL_SECTIONS, carry_over_facts, to_document
from aptly.rebuild.schemas import RebuildResult, RebuiltLine, RebuiltSection

CV = """Aman Mishra
Bengaluru, India | +91 98765 43210 | aman@example.com

SUMMARY
Product manager with six years across hardware and software launches.

EXPERIENCE
Senior Product Manager, Kalyra - 2021 to present
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.

EDUCATION
B.Tech, Computer Science, VIT - 2018

CERTIFICATIONS
AWS Solutions Architect - Associate, 2023

LANGUAGES
English (fluent), Hindi (native)

INTERESTS
Long-distance running, open-source hardware
"""


def _thin_rebuild() -> RebuildResult:
    """What the model returns when it decides only the argument earns space."""
    return RebuildResult(
        headline="Product Manager",
        approach="Led with the deployment-time achievement.",
        sections=[
            RebuiltSection(
                kind="summary",
                title="Summary",
                lines=[RebuiltLine(text="Product manager with six years.", drawn_from="x")],
            )
        ],
    )


def test_a_rebuild_that_drops_a_credential_gets_it_back() -> None:
    original = parse_pasted(CV)

    carried = carry_over_facts(_thin_rebuild(), original)

    kinds = {section.kind for section in carried.sections}
    assert {"education", "certifications", "languages", "interests"} <= kinds


def test_the_carried_lines_are_the_persons_own_words() -> None:
    """Verbatim from the parsed original, so the backstop cannot invent."""
    original = parse_pasted(CV)

    carried = carry_over_facts(_thin_rebuild(), original)

    # Entries as well as loose lines: a certification parses as an entry, so its
    # text is the entry's title rather than a bullet under it.
    words: list[str] = []
    for section in carried.sections:
        words += [line.text for line in section.lines]
        for entry in section.entries:
            words += [entry.title, entry.organisation, entry.start, entry.end]
            words += [line.text for line in entry.lines]
    text = "\n".join(word for word in words if word)

    assert "AWS Solutions Architect" in text
    assert "Hindi" in text
    assert "VIT" in text


def test_it_reaches_the_downloaded_file(tmp_path) -> None:
    """The point of the whole exercise: the person's certifications are in the
    document they actually receive."""
    from aptly.export import export_cv

    original = parse_pasted(CV)
    carried = carry_over_facts(_thin_rebuild(), original)

    downloaded = export_cv(b"", to_document(carried, original), "txt").data.decode()

    assert "AWS Solutions Architect" in downloaded
    assert "Hindi" in downloaded
    assert "B.Tech" in downloaded
    # And the contact row survives, which is the complaint that started this.
    assert "+91 98765 43210" in downloaded
    assert "Bengaluru, India" in downloaded


def test_a_section_the_rebuild_kept_is_not_duplicated() -> None:
    original = parse_pasted(CV)
    result = _thin_rebuild()
    result.sections.append(
        RebuiltSection(
            kind="certifications",
            title="Certifications",
            lines=[RebuiltLine(text="AWS Solutions Architect", drawn_from="x")],
        )
    )

    carried = carry_over_facts(result, original)

    kinds = [section.kind for section in carried.sections]
    assert kinds.count("certifications") == 1


def test_experience_and_skills_are_not_carried_over() -> None:
    """Those *are* the argument. Trimming a weak bullet is the tailoring
    working, not failing, and putting the original back would undo it."""
    assert "experience" not in FACTUAL_SECTIONS
    assert "skills" not in FACTUAL_SECTIONS


def test_a_rebuild_that_kept_everything_is_returned_untouched() -> None:
    original = parse_pasted("Aman Mishra\n\nSUMMARY\nA product manager.\n")
    result = _thin_rebuild()

    assert carry_over_facts(result, original) is result


# ═══════════════════════════════════════════════════════════════════════════
# The contact row, which is where the complaint started
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("Bengaluru, India | +91 98765 43210 | aman@example.com", "Bengaluru, India"),
        ("aman@example.com · Bengaluru · +91 98765 43210", "Bengaluru"),
        ("London | aman@example.com", "London"),
        ("Berlin, Germany\naman@example.com", "Berlin, Germany"),
    ],
)
def test_the_location_is_read_out_of_a_contact_row(header: str, expected: str) -> None:
    """It was only ever looked for on a line of its own, so the common layout —
    a city between the phone and the email — was read as neither and dropped."""
    document = parse_pasted(f"Aman Mishra\n{header}\n\nSUMMARY\nA product manager.\n")

    assert document.contact.location == expected


def test_a_job_location_is_not_mistaken_for_where_they_live() -> None:
    document = parse_pasted(
        "Aman Mishra\naman@example.com\n\nSUMMARY\nA PM.\n\n"
        "EXPERIENCE\nPM, Acme - Dublin, Ireland - 2020 to 2023\n- Did a thing.\n"
    )

    assert document.contact.location != "Dublin, Ireland"
