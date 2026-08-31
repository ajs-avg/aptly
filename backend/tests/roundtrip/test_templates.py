"""The layouts a CV can be set in.

A template is a StyleProfile and nothing more — every renderer already reads
its layout from that one object — so what is worth testing is not that the
rendering works but that the *choice* is honoured, that the three are actually
different, and that every one of them stays inside the constraints that make a
document readable by an applicant tracking system.
"""

from __future__ import annotations

import io
import re
import zipfile

import pytest
from aptly.export import export_cv
from aptly.export.templates import TEMPLATE_ORDER, TEMPLATES
from aptly.ingest import parse_pasted

CV = """Aman Mishra
Bengaluru, India | +91 98765 43210 | aman@example.com

SUMMARY
Product manager with six years across hardware and software launches.

EXPERIENCE
Senior Product Manager, Kalyra - Jan 2021 to Dec 2024
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.
"""


def _docx_xml(data: bytes) -> str:
    return zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode()


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
@pytest.mark.parametrize("fmt", ["docx", "pdf", "txt", "md"])
def test_every_template_renders_in_every_format(key: str, fmt: str) -> None:
    result = export_cv(b"", parse_pasted(CV), fmt, template=key)

    assert len(result.data) > 200
    assert result.rebuilt, "a template is a rebuild, never an edit"


def test_the_three_layouts_are_actually_different() -> None:
    """Otherwise the dialog is offering one thing three times."""
    document = parse_pasted(CV)

    typography = {}
    for key in TEMPLATE_ORDER:
        xml = _docx_xml(export_cv(b"", document, "docx", template=key).data)
        fonts = frozenset(re.findall(r'w:ascii="([^"]+)"', xml))
        sizes = frozenset(re.findall(r'<w:sz w:val="(\d+)"', xml))
        typography[key] = (fonts, sizes)

    assert len(set(typography.values())) == 3


def test_a_template_says_it_replaced_your_formatting() -> None:
    """The trade has to be visible: the person gave up an in-place edit."""
    result = export_cv(b"", parse_pasted(CV), "docx", template="classic")

    assert "Classic" in result.notes[0]
    assert "not used" in result.notes[0]


def test_no_template_keeps_the_documents_own_profile() -> None:
    document = parse_pasted(CV)
    document.style_profile.body.family = "Georgia"

    xml = _docx_xml(export_cv(b"", document, "docx").data)

    assert "Georgia" in xml


def test_an_unknown_template_falls_back_rather_than_failing() -> None:
    """A stale key from an old tab must not cost somebody their download."""
    result = export_cv(b"", parse_pasted(CV), "docx", template="nonsense")

    assert len(result.data) > 200


# ═══════════════════════════════════════════════════════════════════════════
# The floor every template has to stay above
#
# An ATS reads a document by pulling text out in order. What breaks it is
# structural — columns, tables, text boxes, a name in a header — so these are
# constraints rather than preferences.
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
def test_every_template_is_a_single_column(key: str) -> None:
    """Two columns interleave into nonsense when read in order."""
    assert TEMPLATES[key].profile.columns == 1


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
def test_no_template_uses_a_table_or_a_text_box(key: str) -> None:
    xml = _docx_xml(export_cv(b"", parse_pasted(CV), "docx", template=key).data)

    assert "<w:tbl>" not in xml, "a table orphans the cells it holds"
    assert "<w:txbxContent>" not in xml, "a text box is often skipped outright"


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
def test_the_name_is_in_the_body_not_a_header(key: str) -> None:
    """A name in a page header can be dropped entirely, and then the CV is
    anonymous to the system reading it."""
    xml = _docx_xml(export_cv(b"", parse_pasted(CV), "docx", template=key).data)

    assert "Aman Mishra" in xml


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
def test_every_template_uses_a_font_the_reader_will_have(key: str) -> None:
    """A font the reader does not have is a font the reader does not see."""
    safe = {"Calibri", "Cambria", "Arial", "Helvetica", "Georgia", "Times New Roman"}
    profile = TEMPLATES[key].profile

    for spec in (profile.body, profile.name, profile.section_heading, profile.entry_heading):
        assert spec.family in safe


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
def test_no_template_sets_type_too_small_to_read(key: str) -> None:
    """Compact exists to fit more on a page, but a CV that is hard to read has
    saved a page at the cost of the thing it was for."""
    assert TEMPLATES[key].profile.body.size_pt >= 9.5
    assert TEMPLATES[key].profile.line_spacing >= 1.05


@pytest.mark.parametrize("key", TEMPLATE_ORDER)
def test_every_template_keeps_the_content(key: str) -> None:
    """A layout may reset how a CV looks. It may never lose what it says."""
    # Case-folded, because the plain-text renderer sets the name in capitals as
    # its own convention. What is under test is that the content survives a
    # change of layout, not that the casing does.
    text = export_cv(b"", parse_pasted(CV), "txt", template=key).data.decode().lower()

    for fragment in ("aman mishra", "aman@example.com", "+91 98765 43210", "12 weeks to 6"):
        assert fragment in text
