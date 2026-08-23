"""Downloading a CV as something other than what was uploaded.

People hit this constantly: the CV is a .docx, the application form wants a PDF.
The behaviour that matters is that the *content* survives the conversion exactly
— every format is a different way of writing the same document, and a name or a
figure lost on the way out is worse than not offering the format at all.
"""

from __future__ import annotations

import pytest
from aptly.export import TARGET_FORMATS, export_cv
from aptly.export.render import render, render_markdown, render_tex, render_text
from aptly.ingest import parse_cv, parse_pasted

CV = """\
Priya Raman
priya.raman@example.com | +91 98220 11445 | Bengaluru

PROFESSIONAL SUMMARY
Data analyst with four years turning messy operational data into things people
act on. Happiest when a number changes a decision.

TECHNICAL SKILLS
Languages: Python, SQL, R
Tools: PostgreSQL, Airflow, Tableau

WORK EXPERIENCE
Senior Data Analyst, Meridian Retail — 2022 to present
- Rebuilt the demand forecast, cutting stockouts by 18% across 340 stores.
- Wrote the nightly reconciliation job that checks 2.4M rows against the feed.

Data Analyst, Coastal Logistics — 2020 to 2022
- Automated the weekly board pack, saving roughly 6 hours a week.

EDUCATION
M.Sc. Statistics, University of Pune — 2020
"""


@pytest.fixture
def document():
    return parse_pasted(CV)


#: The specifics a conversion is most likely to lose: figures, proper nouns,
#: and the punctuation inside product names.
LANDMARKS = [
    "Priya Raman",
    "priya.raman@example.com",
    "Meridian Retail",
    "Coastal Logistics",
    "18%",
    "340",
    "2.4M",
    "Airflow",
    "PostgreSQL",
    "Tableau",
    "M.Sc",
]


def _readable(data: bytes, target: str) -> str:
    r"""The words a format carries, with its own conventions removed.

    Each format legitimately changes presentation: plain text shouts the name,
    LaTeX writes ``18\%`` because a bare ``%`` starts a comment. Comparing raw
    bytes would call both of those data loss, so the comparison is on content —
    case folded, escapes undone.
    """
    if target in {"docx", "pdf"}:
        # Binary containers: re-parse rather than grep, which is the stronger
        # test anyway — the file has to be readable by something.
        return parse_cv(data, f"cv.{target}").plain_text().lower()

    text = data.decode("utf-8")
    if target == "tex":
        for escaped, plain in (
            (r"\&", "&"),
            (r"\%", "%"),
            (r"\$", "$"),
            (r"\_", "_"),
            (r"\#", "#"),
        ):
            text = text.replace(escaped, plain)
    return text.lower()


@pytest.mark.parametrize("target", TARGET_FORMATS)
def test_every_format_keeps_the_content(document, target: str) -> None:
    """A conversion may change how the document looks. It may not change what
    it says — and a figure dropped on the way out is invisible until a recruiter
    reads the version that lost it."""
    data = render(document, target)
    assert data, f"{target} produced nothing"

    text = _readable(data, target)
    missing = [item for item in LANDMARKS if item.lower() not in text]
    assert not missing, f"{target} lost: {missing}"


def test_a_rebuild_says_it_is_one(document) -> None:
    """Downloading a different format silently would let somebody send a CV
    whose layout they have never seen."""
    result = export_cv(CV.encode(), document, "pdf")

    assert result.rebuilt is True
    assert result.notes
    assert result.filename.endswith(".pdf")


def test_the_source_format_is_still_an_edit(document) -> None:
    """The product's strongest guarantee, and it must survive this feature:
    asking for the format you uploaded returns your own file, untouched."""
    original = CV.encode()
    result = export_cv(original, document, "txt")

    assert result.rebuilt is False
    assert result.data == original


def test_an_unknown_format_is_refused(document) -> None:
    from aptly.errors import UnsupportedFormatError

    with pytest.raises(UnsupportedFormatError):
        export_cv(CV.encode(), document, "pages")


# ═══════════════════════════════════════════════════════════════════════════
# LaTeX, where the content can break the container
# ═══════════════════════════════════════════════════════════════════════════


def test_latex_escapes_what_would_not_compile() -> None:
    """A CV saying "R&D" or "cut costs 30%" produces a .tex that fails to build,
    and the person finds out long after they have left."""
    hostile = parse_pasted(
        "Ann Lee\nann@example.com\n\nEXPERIENCE\n"
        "Analyst, R&D Corp — 2020 to 2023\n"
        "- Cut spend 30% and saved $50k on the legacy_stack.\n"
    )
    source = render_tex(hostile)

    assert r"R\&D" in source
    assert r"30\%" in source
    assert r"\$50k" in source
    assert r"legacy\_stack" in source

    for line in source.splitlines():
        stripped = line.replace(r"\&", "").replace(r"\%", "").replace(r"\$", "")
        # `$\cdot$` is deliberate maths mode in the contact line; everything
        # else must be escaped.
        assert "&" not in stripped
        assert "%" not in stripped


def test_plain_text_survives_being_pasted_into_a_form(document) -> None:
    """A surprising number of applications are still a textarea, and this is
    the format an ATS parses most reliably."""
    text = render_text(document)

    assert "PRIYA RAMAN" in text
    assert "- Rebuilt the demand forecast" in text
    assert "\t" not in text


def test_markdown_uses_real_structure(document) -> None:
    body = render_markdown(document)

    assert body.startswith("# Priya Raman")
    assert "## WORK EXPERIENCE" in body
    assert "- Automated the weekly board pack" in body
