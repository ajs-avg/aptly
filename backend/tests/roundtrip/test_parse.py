"""Parsing tests.

The promise these lock in: whatever format a CV arrives in, it lands in the same
canonical model with the same sections, the same jobs and the same bullets.

Each fixture was written to break something specific — a table-based two-column
Word layout, a sidebar PDF whose reading order interleaves, a LaTeX heading that
carries the employer outside the macro braces. The assertions here are what
stops those regressing.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from aptly.ingest import parse_cv, parse_pasted
from aptly.model.document import CVDocument

from tests.fixtures.personas import ALL_PERSONAS, FORMAT_BY_PERSONA, Persona

CV_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "cvs"


def _load(persona: Persona) -> CVDocument:
    path = CV_DIR / f"{persona.key}.{FORMAT_BY_PERSONA[persona.key]}"
    if not path.exists():
        pytest.skip("fixture missing: run `uv run python tests/fixtures/generate.py`")
    return parse_cv(path.read_bytes(), path.name)


def _ids(personas: tuple[Persona, ...]) -> list[str]:
    return [p.key for p in personas]


# ═══════════════════════════════════════════════════════════════════════════
# Structure
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_identifies_the_person(persona: Persona) -> None:
    doc = _load(persona)
    assert doc.contact.name == persona.name
    assert doc.contact.email == persona.email


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_finds_every_job(persona: Persona) -> None:
    """One entry per job — no splitting a role in two, no merging two into one.

    Splitting is the common failure: a right-aligned dates line or a bolded
    job title reads like the start of a new entry.
    """
    experience = _load(persona).section("experience")
    assert experience is not None, "no experience section recognised"
    assert len(experience.entries) == len(persona.experience)


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_attributes_each_job_to_the_right_employer(persona: Persona) -> None:
    experience = _load(persona).section("experience")
    assert experience is not None
    for entry, job in zip(experience.entries, persona.experience, strict=True):
        haystack = f"{entry.role or ''} {entry.org or ''} {entry.location or ''}"
        assert job.org in haystack, f"expected {job.org!r} in {haystack!r}"


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_keeps_every_achievement(persona: Persona) -> None:
    """Every bullet survives ingestion.

    Compared on a normalised, punctuation-free basis: PDFs re-wrap text and
    LaTeX escapes characters, so the exact string differs even when nothing
    was lost.
    """
    text = _squash(_load(persona).plain_text())
    for job in persona.experience:
        for bullet in job.bullets:
            assert _squash(bullet) in text, f"lost bullet: {bullet[:60]}…"


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_recognises_the_standard_sections(persona: Persona) -> None:
    kinds = {section.kind for section in _load(persona).sections}
    assert {"experience", "education", "skills"} <= kinds


# ═══════════════════════════════════════════════════════════════════════════
# The addressable model
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_node_ids_are_unique(persona: Persona) -> None:
    """Ids address a node for Apply; a collision would edit the wrong line."""
    ids = [node.id for node in _load(persona).nodes]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_node_ids_are_stable_across_reparsing(persona: Persona) -> None:
    """Parsing the same bytes twice must produce the same ids, or version
    history and undo lose their footing."""
    path = CV_DIR / f"{persona.key}.{FORMAT_BY_PERSONA[persona.key]}"
    if not path.exists():
        pytest.skip("fixture missing")
    data = path.read_bytes()
    first = parse_cv(data, path.name)
    second = parse_cv(data, path.name)
    assert [n.id for n in first.nodes] == [n.id for n in second.nodes]
    assert first.content_hash == second.content_hash


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_bullets_are_editable_and_facts_are_not(persona: Persona) -> None:
    """The no-fabrication rule starts here: job titles, employers and dates are
    never handed to the model as editable text."""
    doc = _load(persona)
    editable_roles = {node.role for node in doc.editable_nodes}
    assert "bullet" in editable_roles
    assert not editable_roles & {"entry_role", "entry_org", "entry_meta", "name", "contact"}


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_apply_rewrites_only_the_addressed_node(persona: Persona) -> None:
    doc = _load(persona)
    target = doc.editable_nodes[0]
    others = {n.id: n.text for n in doc.nodes if n.id != target.id}

    assert doc.apply(target.id, target.text, "Rewritten by the tailoring pass.")
    assert doc.node(target.id).text == "Rewritten by the tailoring pass."  # type: ignore[union-attr]
    assert {n.id: n.text for n in doc.nodes if n.id != target.id} == others


@pytest.mark.parametrize("persona", ALL_PERSONAS, ids=_ids(ALL_PERSONAS))
def test_apply_refuses_a_stale_anchor(persona: Persona) -> None:
    """If the line changed since the suggestion was made, Apply must decline
    rather than overwrite the person's own edit."""
    doc = _load(persona)
    target = doc.editable_nodes[0]
    original = target.text

    assert not doc.apply(target.id, "text this node never contained", "anything")
    assert target.text == original


def test_apply_tolerates_typographic_variation() -> None:
    """Word, Docs and LaTeX emit different quotes and dashes for the same text.
    Anchor matching normalises, so a smart quote does not break Apply."""
    doc = parse_pasted(
        "Ada Lovelace\nada@example.com\n\nEXPERIENCE\n\n"
        "Analyst, Analytical Engine Co — Jan 2020 – Present\n"
        "- Wrote the world's first algorithm — and documented it.\n"
    )
    bullet = next(n for n in doc.editable_nodes if "algorithm" in n.text)
    curly = bullet.text.replace("'", "’").replace("—", "—")

    assert doc.apply(bullet.id, curly, "Rewritten.")


# ═══════════════════════════════════════════════════════════════════════════
# Cross-format agreement
# ═══════════════════════════════════════════════════════════════════════════


def test_same_cv_in_two_formats_agrees() -> None:
    """The point of the canonical model: upload as .txt or as .md and get the
    same structure, so suggestions do not depend on the file type."""
    import tempfile

    from tests.fixtures.generate import write_txt
    from tests.fixtures.personas import ELENA

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "elena.txt"
        write_txt(ELENA, path)
        raw = path.read_text(encoding="utf-8")

    as_txt = parse_cv(raw.encode(), "elena.txt")
    as_md = parse_cv(raw.encode(), "elena.md")

    assert _kinds(as_txt) == _kinds(as_md)
    assert _job_count(as_txt) == _job_count(as_md) == len(ELENA.experience)


# ═══════════════════════════════════════════════════════════════════════════
# Rejections
# ═══════════════════════════════════════════════════════════════════════════


def test_rejects_legacy_word_with_a_useful_hint() -> None:
    from aptly.errors import UnsupportedFormatError

    with pytest.raises(UnsupportedFormatError) as caught:
        parse_cv(b"\xd0\xcf\x11\xe0", "resume.doc")
    assert "save as .docx" in caught.value.hint.lower()


def test_rejects_an_image_with_a_useful_hint() -> None:
    from aptly.errors import UnsupportedFormatError

    with pytest.raises(UnsupportedFormatError) as caught:
        parse_cv(b"\x89PNG\r\n", "resume.png")
    assert caught.value.hint


def test_reports_a_corrupt_file_calmly() -> None:
    from aptly.errors import ParseError

    with pytest.raises(ParseError) as caught:
        parse_cv(b"not a real docx at all", "resume.docx")
    assert caught.value.hint, "an error must say what to do next"


def test_empty_input_warns_rather_than_crashing() -> None:
    doc = parse_pasted("   \n\n  ")
    assert doc.nodes == []
    assert doc.warnings


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _squash(text: str) -> str:
    """Lowercase alphanumerics only — survives re-wrapping and escaping."""
    return "".join(ch for ch in text.lower() if ch.isalnum())


def _kinds(doc: CVDocument) -> list[str]:
    return [section.kind for section in doc.sections]


def _job_count(doc: CVDocument) -> int:
    section = doc.section("experience")
    return len(section.entries) if section else 0
