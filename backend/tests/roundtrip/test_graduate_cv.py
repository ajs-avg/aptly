"""Regressions from a real graduate CV.

Every test here corresponds to something that was actually broken when a real
person put their CV through the product. Graduate and early-career CVs are a
large share of who this is for, and they differ from the senior CVs the parser
was first built against in ways that matter:

* headings are qualified — "Internship Experience", "Key Projects" — never the
  bare words a lookup table expects;
* bullets are long and wrap over three or four physical lines;
* projects carry the detail that experience would on a senior CV.

The failure mode was quiet and severe: the CV parsed into fragments, so the
model was asked to improve half-sentences like "and performed model", and the
experience section was never recognised at all.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from aptly.export import export_cv
from aptly.ingest import parse_cv

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "cvs" / "graduate_student.txt"


@pytest.fixture
def document():
    if not FIXTURE.exists():
        pytest.skip("graduate fixture missing")
    return parse_cv(FIXTURE.read_bytes(), FIXTURE.name)


# ═══════════════════════════════════════════════════════════════════════════
# Headings
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    ("heading", "expected"),
    [
        ("INTERNSHIP EXPERIENCE", "experience"),
        ("Internship Experience", "experience"),
        ("Relevant Work Experience", "experience"),
        ("Professional Background", "experience"),
        ("KEY PROJECTS", "projects"),
        ("Academic Projects", "projects"),
        ("Major Projects", "projects"),
        ("Academic Qualifications", "education"),
        ("Certifications and Courses", "certifications"),
        ("Positions of Responsibility", "volunteering"),
        ("Extracurricular Activities", "volunteering"),
        ("Achievements", "awards"),
        ("Technical Skills", "skills"),
        ("Professional Summary", "summary"),
    ],
)
def test_qualified_headings_are_classified(heading: str, expected: str) -> None:
    """A heading almost never appears as the bare vocabulary word."""
    from aptly.ingest.sections import classify_heading

    assert classify_heading(heading) == expected


def test_longer_phrases_win_over_the_words_inside_them() -> None:
    from aptly.ingest.sections import classify_heading

    assert classify_heading("Volunteer Experience") == "volunteering"
    assert classify_heading("Work Experience") == "experience"


def test_ordinary_sentences_are_not_headings() -> None:
    from aptly.ingest.sections import classify_heading

    assert classify_heading("Built the projects listed below for a client.") is None
    assert classify_heading("Led a team of six engineers across two projects") is None


def test_a_graduate_cv_finds_its_experience_section(document) -> None:
    """The bug the user hit: 'No work-experience section was recognised.'"""
    assert document.section("experience") is not None
    assert not [w for w in document.warnings if "work-experience" in w]


def test_a_graduate_cv_finds_its_projects(document) -> None:
    projects = document.section("projects")
    assert projects is not None
    assert projects.title == "KEY PROJECTS"


# ═══════════════════════════════════════════════════════════════════════════
# Wrapped lines
# ═══════════════════════════════════════════════════════════════════════════


def test_wrapped_bullets_become_whole_sentences(document) -> None:
    """A bullet that wraps over four lines is one thought, not four.

    Before this, the model was handed "and performed model" as a complete unit
    and dutifully rewrote it — a suggestion that was both meaningless and
    impossible to apply.
    """
    text = document.plain_text()
    assert "Built semantic search with document chunking" in text

    for node in document.editable_nodes:
        stripped = node.text.strip()
        if len(stripped) < 25:
            continue
        assert not stripped.startswith(("and ", "or ", "using ", "with ", "for ")), (
            f"fragment survived: {stripped[:70]!r}"
        )


def test_a_wrapped_bullet_is_one_node(document) -> None:
    projects = document.section("projects")
    assert projects is not None
    rag = [
        node
        for node in projects.nodes
        if "Retrieval-Augmented" in node.text or "RAG System" in node.text
    ]
    assert len(rag) == 1, "the RAG project should be a single addressable node"
    assert "Gradio" in rag[0].text, "the tail of the bullet was lost"


def test_a_wrapped_summary_is_one_paragraph(document) -> None:
    """A professional summary wraps over four lines and is still one thought.

    Regression: the opening line of a summary is short, comma-joined and
    unpunctuated, which the entry-heading heuristic reads as the start of a job.
    Blocking the merge there left the summary as half-sentences, and the model
    dutifully proposed rewrites of fragments like "Algorithms, and Data
    Science. Experienced in building".
    """
    summary = document.section("summary")
    assert summary is not None
    assert len(summary.loose_nodes) == 1, "the summary should be a single node"

    text = summary.loose_nodes[0].text
    assert text.startswith("AI & ML undergraduate")
    assert "modern web technologies" in text, "the end of the summary was lost"


def test_no_node_starts_mid_sentence(document) -> None:
    """Nothing addressable should begin with a word that continues a thought."""
    for node in document.editable_nodes:
        first = node.text.strip().split(" ", 1)[0].rstrip(",")
        assert first.lower() not in {
            "and",
            "or",
            "algorithms",
            "using",
            "with",
            "including",
            "validation",
        }, f"fragment: {node.text[:70]!r}"


def test_headings_are_never_absorbed_into_the_line_above(document) -> None:
    titles = {section.title for section in document.sections if section.title}
    assert "TECHNICAL SKILLS" in titles
    assert "INTERNSHIP EXPERIENCE" in titles


def test_the_name_is_not_glued_to_the_next_line(document) -> None:
    """Two short unpunctuated lines at column zero are two lines."""
    assert document.contact.name == "YASHWINI RAO"


# ═══════════════════════════════════════════════════════════════════════════
# Export
# ═══════════════════════════════════════════════════════════════════════════


def test_editing_a_bullet_keeps_its_bullet_marker(document) -> None:
    """The anchor must start after the glyph, or Apply eats the "- "."""
    original = FIXTURE.read_bytes()
    target = next(node for node in document.editable_nodes if "Gradio" in node.text)
    document.apply(target.id, target.text, "Rebuilt the assistant end to end.")

    exported = export_cv(original, document).data.decode("utf-8")
    assert "- Rebuilt the assistant end to end." in exported


def test_an_untouched_graduate_cv_round_trips_byte_for_byte(document) -> None:
    original = FIXTURE.read_bytes()
    assert export_cv(original, document).data == original


def test_editing_one_wrapped_bullet_leaves_the_others_alone(document) -> None:
    original = FIXTURE.read_bytes()
    target = next(node for node in document.editable_nodes if "Parkinson" in node.text)
    others = {n.id: n.text for n in document.nodes if n.id != target.id}

    document.apply(target.id, target.text, "Built a classifier on a public voice dataset.")
    reparsed = parse_cv(export_cv(original, document).data, FIXTURE.name)

    after = {n.id: n.text for n in reparsed.nodes if n.id != target.id}
    shared = others.keys() & after.keys()
    assert shared
    assert {k: others[k] for k in shared} == {k: after[k] for k in shared}
