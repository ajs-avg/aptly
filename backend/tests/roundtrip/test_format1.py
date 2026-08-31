"""Format 1 — the LaTeX résumé, as source somebody can compile and edit.

The template's identity is in its macros rather than in a style profile, so
what is under test is that those macros are used, that the source is
self-contained, and that nothing about the person is lost on the way into it.
"""

from __future__ import annotations

import pytest
from aptly.export import export_cv
from aptly.export.latex_format1 import esc, render_format1
from aptly.export.templates import TEMPLATES
from aptly.ingest import parse_pasted

CV = """Aman Babu
Uttam Nagar, Delhi | +91-6396267480 | babu.a@samsung.com
linkedin.com/in/amanbabu23 | github.com/aman-spp

EDUCATION
PDPM IIIT Jabalpur - 2019 to 2023
- B.Tech Computer Science, CGPA 7.9

EXPERIENCE
Senior Executive, Samsung SDS - December 2024 to January 2025
- Developed RPA solutions with Brity RPA Designer and Orchestrator.

PROJECTS
Interview Creation Portal - 2024
- An interview page where the admin can create an interview.

TECHNICAL SKILLS
Languages: Python, C++, JavaScript, SQL

CERTIFICATIONS
Mastering Data Structure and Algorithms - Udemy
"""


def _tex() -> str:
    return export_cv(b"", parse_pasted(CV), "tex", template="format-1").data.decode()


def test_the_templates_own_macros_are_used() -> None:
    """Not the stock writer. This is the whole reason it has a renderer."""
    tex = _tex()

    for macro in (
        r"\resumeSubheading",
        r"\resumeItemListStart",
        r"\resumeSubHeadingListStart",
        r"\resumeProjectHeading",
        r"\sbullet",
    ):
        assert macro in tex


def test_the_source_needs_no_file_beside_it() -> None:
    """The original pulled three icons in as images that do not exist, so it
    could not compile for anybody. A .tex that needs something installed is not
    a deliverable, it is homework."""
    tex = _tex()

    assert r"\includegraphics" not in tex
    for missing in ("codeforces.jpg", "leetcode.png", "gfg.png"):
        assert missing not in tex


def test_only_one_fontawesome_is_loaded() -> None:
    """The original loaded `fontawesome5` and `fontawesome`, which clash."""
    tex = _tex()

    assert tex.count(r"\usepackage{fontawesome") == 1


def test_a_package_nothing_draws_with_is_not_loaded() -> None:
    tex = _tex()

    assert r"\usepackage{tikz}" not in tex
    assert r"\usetikzlibrary" not in tex


def test_the_document_is_balanced() -> None:
    tex = _tex()

    assert tex.count(r"\begin{document}") == 1
    assert tex.count(r"\end{document}") == 1
    assert tex.count(r"\resumeItemListStart") == tex.count(r"\resumeItemListEnd")
    assert tex.count(r"\resumeSubHeadingListStart") == tex.count(r"\resumeSubHeadingListEnd")


def test_contact_links_become_named_icon_links() -> None:
    """The template names the site rather than printing the URL, which is what
    keeps a header of five links on one line."""
    tex = _tex()

    assert r"\faLinkedin" in tex and r"\underline{LinkedIn}" in tex
    assert r"\faGithub" in tex and r"\underline{GitHub}" in tex
    assert r"\faEnvelope" in tex
    assert r"\faPhone" in tex


def test_nothing_about_the_person_is_lost() -> None:
    tex = _tex()

    for fragment in (
        "Aman Babu",
        "babu.a@samsung.com",
        "+91-6396267480",
        "Samsung SDS",
        "Brity RPA Designer",
        "Interview Creation Portal",
        "Python, C++, JavaScript, SQL",
        "Mastering Data Structure",
    ):
        assert fragment in tex, f"{fragment!r} did not survive"


def test_a_parsed_separator_does_not_reach_a_table_cell() -> None:
    """ "Senior Executive, Samsung SDS - December 2024" splits into a role and an
    org, and the org keeps the dash. Harmless in plain text; in a ruled cell it
    is a stray hyphen in white space."""
    tex = _tex()

    assert "{Samsung SDS}" in tex
    assert "{Samsung SDS -}" not in tex


# ═══════════════════════════════════════════════════════════════════════════
# Escaping — a CV full of C++, 40% and R&D
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("R&D", r"R\&D"),
        ("grew 40%", r"grew 40\%"),
        ("cost $2m", r"cost \$2m"),
        ("C#", r"C\#"),
        ("snake_case", r"snake\_case"),
        ("a{b}c", r"a\{b\}c"),
    ],
)
def test_special_characters_are_escaped(raw: str, expected: str) -> None:
    assert esc(raw) == expected


def test_a_backslash_is_escaped_once() -> None:
    """Escaped last, or the replacements this introduces get escaped again and
    an ampersand comes out as `\\textbackslash{}&`."""
    assert esc("a\\b & c") == r"a\textbackslash{}b \& c"


def test_an_unescaped_percent_would_comment_out_the_line() -> None:
    """The failure this prevents: a stray % swallows the rest of the line, and
    the CV silently loses a sentence."""
    document = parse_pasted(
        "Aman Babu\nb@example.com\n\nEXPERIENCE\nPM, Acme - 2024\n"
        "- Grew revenue 40% and cut churn.\n"
    )

    tex = render_format1(document)

    assert r"40\%" in tex
    assert "cut churn" in tex


# ═══════════════════════════════════════════════════════════════════════════
# How it sits beside the other layouts
# ═══════════════════════════════════════════════════════════════════════════


def test_only_format_1_uses_the_latex_writer() -> None:
    """The others are a style profile, which is all the .docx and .pdf writers
    need. This one's layout is macros, which a profile cannot carry."""
    assert TEMPLATES["format-1"].tex_renderer == "format1"
    for key in ("classic", "modern", "compact"):
        assert TEMPLATES[key].tex_renderer == "stock"


def test_the_other_layouts_still_get_the_stock_writer() -> None:
    tex = export_cv(b"", parse_pasted(CV), "tex", template="modern").data.decode()

    assert r"\resumeSubheading" not in tex
    assert r"\documentclass" in tex


@pytest.mark.parametrize("fmt", ["docx", "pdf", "txt"])
def test_format_1_still_exports_in_the_other_formats(fmt: str) -> None:
    """Choosing it and downloading Word gives its typography, not its macros —
    which is honest, and must not be a failure."""
    result = export_cv(b"", parse_pasted(CV), fmt, template="format-1")

    assert len(result.data) > 200
