"""The mechanical mistakes a person is embarrassed to have sent.

Every check is deterministic and runs without a model, so the property that
matters most is the one a model could not give: **a clean CV produces nothing**.
A proofreader that cries wolf is one people stop reading, and then it catches
nothing at all — so the false-positive tests here are as load-bearing as the
ones that find a fault.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.validate.proofread import proofread

CLEAN = """Aman Mishra
Bengaluru, India | +91 98765 43210 | aman@example.com

SUMMARY
Product manager with six years across hardware and software launches.

EXPERIENCE
Senior Product Manager, Kalyra - Jan 2021 to Dec 2024
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.
- Ran discovery with 40 customers and shipped a pricing change worth 8% ARR.
"""


def _kinds(cv: str) -> set[str]:
    return {finding.kind for finding in proofread(parse_pasted(cv))}


def test_a_clean_cv_produces_no_findings() -> None:
    """The load-bearing one. Noise here costs the whole feature its credibility."""
    assert proofread(parse_pasted(CLEAN)) == []


# ═══════════════════════════════════════════════════════════════════════════
# Dates
# ═══════════════════════════════════════════════════════════════════════════


def test_a_role_that_ends_before_it_starts() -> None:
    cv = CLEAN.replace("Jan 2021 to Dec 2024", "Jan 2023 to Dec 2022")

    assert "dates_reversed" in _kinds(cv)


def test_a_role_that_starts_in_the_future() -> None:
    cv = CLEAN.replace("Jan 2021 to Dec 2024", "Jan 2088 to Dec 2090")

    assert "date_in_future" in _kinds(cv)


def test_present_is_not_read_as_a_broken_date() -> None:
    """An open-ended role is the normal case, not a fault."""
    cv = CLEAN.replace("Jan 2021 to Dec 2024", "Jan 2021 to Present")

    assert "dates_reversed" not in _kinds(cv)


def test_two_date_formats_on_one_cv() -> None:
    """Each date looks right on its own, which is why nobody catches this."""
    cv = CLEAN + "\nProduct Manager, Northwind - 06/2018 to 12/2020\n- Led a launch.\n"

    assert "date_styles_mixed" in _kinds(cv)


def test_a_bare_year_does_not_count_as_a_second_format() -> None:
    """ "2018" beside "Jan 2021" is a normal CV, not an inconsistency."""
    cv = CLEAN + "\nEDUCATION\nB.Tech, VIT - 2018\n"

    assert "date_styles_mixed" not in _kinds(cv)


# ═══════════════════════════════════════════════════════════════════════════
# Contact details
#
# Read from the header text rather than the parsed contact block, because the
# parser only keeps what it could validate — a truncated phone and an address
# with no domain both arrive as None, and "there is no email on this CV" would
# send somebody looking for a line that is right in front of them.
# ═══════════════════════════════════════════════════════════════════════════


def test_an_email_with_no_domain() -> None:
    cv = CLEAN.replace("aman@example.com", "aman@example")

    assert "email_malformed" in _kinds(cv)
    assert "no_email" not in _kinds(cv), "it is malformed, not missing"


def test_a_phone_number_missing_digits() -> None:
    cv = CLEAN.replace("+91 98765 43210", "+91 9876")

    assert "phone_short" in _kinds(cv)


def test_a_cv_with_no_email_at_all() -> None:
    cv = CLEAN.replace(" | aman@example.com", "")

    assert "no_email" in _kinds(cv)


# ═══════════════════════════════════════════════════════════════════════════
# The text
# ═══════════════════════════════════════════════════════════════════════════


def test_a_doubled_word() -> None:
    cv = CLEAN.replace("manager with six", "manager with with six")

    assert "doubled_word" in _kinds(cv)


@pytest.mark.parametrize("word", ["had had", "that that"])
def test_a_legitimately_doubled_word_is_left_alone(word: str) -> None:
    cv = CLEAN.replace("Ran discovery", f"Confirmed {word} worked, ran discovery")

    assert "doubled_word" not in _kinds(cv)


@pytest.mark.parametrize("placeholder", ["TODO: add the pricing win", "Lorem ipsum dolor"])
def test_a_placeholder_left_in(placeholder: str) -> None:
    cv = CLEAN + f"- {placeholder}.\n"

    assert "placeholder" in _kinds(cv)


def test_a_space_before_a_full_stop() -> None:
    cv = CLEAN.replace("software launches.", "software launches .")

    assert "space_before_punctuation" in _kinds(cv)


def test_two_spaces_inside_a_line() -> None:
    cv = CLEAN.replace("ramp time", "ramp  time")

    assert "double_space" in _kinds(cv)


def test_bullets_that_disagree_about_full_stops() -> None:
    cv = CLEAN.replace("worth 8% ARR.", "worth 8% ARR")

    assert "bullet_punctuation_mixed" in _kinds(cv)


# ═══════════════════════════════════════════════════════════════════════════
# Markdown that survived a paste
#
# Pasted CVs come out of ChatGPT, Notion and GitHub, all of which emit Markdown
# — and the paste path never told the parser to strip it, so "# Aman Mishra"
# was the person's name and a "---" between sections became a bullet point.
# ═══════════════════════════════════════════════════════════════════════════

MARKDOWN = """# Aman Mishra
**Product Manager** | aman@example.com | +91 98765 43210

## SUMMARY
Product manager with *six years* across launches.

## EXPERIENCE
### Senior Product Manager, Kalyra - Jan 2021 to Dec 2024
* Cut new-site ramp time from 12 weeks to 6.

---

## SKILLS
`Python`, `SQL`, **RAG**
"""


def test_a_pasted_markdown_cv_keeps_no_syntax() -> None:
    document = parse_pasted(MARKDOWN)

    assert document.contact.name == "Aman Mishra"
    text = document.plain_text()
    for syntax in ("#", "**", "`", "*six years*"):
        assert syntax not in text, f"{syntax!r} survived into the document"


def test_a_horizontal_rule_is_not_a_bullet() -> None:
    """It was reaching the finished CV as a line reading "---"."""
    assert "---" not in parse_pasted(MARKDOWN).plain_text()


def test_markdown_headings_become_section_titles() -> None:
    document = parse_pasted(MARKDOWN)

    titles = {section.title for section in document.sections}
    assert "SUMMARY" in titles
    assert "## SUMMARY" not in titles


def test_the_proofreader_reports_markdown_it_still_finds() -> None:
    """A backstop for syntax that reached a document some other way.

    Built by hand rather than pasted, because pasting text containing `**` is
    now *detected* as Markdown and stripped on the way in — which is the better
    outcome, and is what the tests above assert. This covers the case where a
    .docx or PDF simply had the characters typed into it.
    """
    document = parse_pasted(CLEAN)
    section = document.sections[-1]
    section.entries[0].bullets[0].text = "Built **the** thing."

    assert "markdown_left_in" in {finding.kind for finding in proofread(document)}
