"""Turn parsed lines into a :class:`CVDocument`.

Each format parser does the format-specific work — unzipping a .docx, walking
glyph boxes in a .pdf, reading LaTeX macros — and emits a flat list of
:class:`ParsedLine`. This module owns everything after that: deciding what is a
heading, where one job ends and the next begins, which lines are bullets.

Structure inference lives here, once, so the same CV uploaded as .docx and as
.pdf produces the same sections and the same suggestions.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field

from aptly.ingest.sections import (
    classify_heading,
    extract_contact_bits,
    is_bullet,
    is_entry_meta,
    looks_like_entry_heading,
    looks_like_heading,
    parse_date_range,
    split_entry_heading,
    strip_bullet,
)
from aptly.model.anchors import SourceAnchor
from aptly.model.document import (
    ContactBlock,
    CVDocument,
    Entry,
    Section,
    SectionKind,
    TextNode,
    make_node_id,
)
from aptly.model.style import StyleProfile


@dataclass(slots=True)
class ParsedLine:
    """One line of the source, with whatever visual signals the format gave us."""

    text: str
    anchor: SourceAnchor
    bold: bool = False
    italic: bool = False
    size_pt: float | None = None
    #: The format told us outright that this is a list item (a Word list style,
    #: a LaTeX ``\item``). More reliable than sniffing for a bullet glyph.
    is_list_item: bool = False
    #: Blank lines are dropped, but a gap before a line is a structural hint.
    gap_before: bool = False


@dataclass(slots=True)
class _Cursor:
    """Mutable state while walking the lines."""

    sections: list[Section] = field(default_factory=list)
    section: Section | None = None
    entry: Entry | None = None
    seq: int = 0

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq


def build_document(
    lines: list[ParsedLine],
    *,
    doc_id: str,
    source_format: str,
    source_filename: str,
    content_hash: str,
    style_profile: StyleProfile,
    warnings: list[str] | None = None,
) -> CVDocument:
    """Assemble a document from parsed lines."""
    lines = [ln for ln in lines if ln.text.strip()]
    warn = list(warnings or [])

    if not lines:
        warn.append("No readable text found in this file.")
        return CVDocument(
            doc_id=doc_id,
            source_format=source_format,  # type: ignore[arg-type]
            source_filename=source_filename,
            content_hash=content_hash,
            style_profile=style_profile,
            warnings=warn,
        )

    body_size = _median_size(lines)
    header_end = _find_header_end(lines)
    contact = _build_contact(lines[:header_end], all_lines=lines)

    cur = _Cursor()
    _open_section(cur, "header", None, None)
    for ln in lines[:header_end]:
        _add_loose(cur, ln, "contact" if ln is not lines[0] else "name")

    for ln in lines[header_end:]:
        _consume(cur, ln, body_size=body_size)

    _close_entry(cur)
    if cur.section is not None:
        cur.sections.append(cur.section)

    sections = [s for s in cur.sections if s.nodes]
    if not any(s.kind == "experience" for s in sections):
        warn.append(
            "No work-experience section was recognised. "
            "Tailoring still works, but suggestions will be less targeted."
        )

    return CVDocument(
        doc_id=doc_id,
        source_format=source_format,  # type: ignore[arg-type]
        source_filename=source_filename,
        content_hash=content_hash,
        style_profile=style_profile,
        contact=contact,
        sections=sections,
        warnings=warn,
    )


# ── walking ─────────────────────────────────────────────────────────────────


def _consume(cur: _Cursor, ln: ParsedLine, *, body_size: float) -> None:
    text = ln.text.strip()
    larger = ln.size_pt is not None and ln.size_pt > body_size * 1.12

    # A heading we recognise by name is always trusted.
    kind = classify_heading(text)
    if kind is not None:
        _close_entry(cur)
        _open_section(cur, kind, text, ln)
        return

    if cur.section is None:
        _open_section(cur, "custom", None, None)

    assert cur.section is not None
    if ln.is_list_item or is_bullet(text):
        _add_bullet(cur, ln)
        return

    # A new entry heading — but only inside sections that hold entries. A short
    # line in a skills section is a skills line, not a new job.
    #
    # This is checked *before* the visual heading test because a job title is
    # usually bold and short, and would otherwise be mistaken for a new section
    # every single time.
    if cur.section.kind in _ENTRY_SECTIONS and looks_like_entry_heading(text):
        # A dates-and-location line belongs to the entry above it. Layouts that
        # right-align dates put them on their own line, which would otherwise
        # look like a second job at the same employer.
        if cur.entry is not None and not cur.entry.bullets and is_entry_meta(text):
            _absorb_meta(cur, ln)
            return
        _close_entry(cur)
        _open_entry(cur, ln)
        return

    # A bespoke heading we have no vocabulary for, recognised only by how it
    # looks. Requires the current section to already hold something: the first
    # line after "EDUCATION" is that section's content, never a new heading.
    if (
        not ln.is_list_item
        and _has_content(cur.section)
        and looks_like_heading(text, is_bold=ln.bold, is_larger=larger)
    ):
        _close_entry(cur)
        _open_section(cur, "custom", text, ln)
        return

    if cur.entry is not None:
        # Prose under an open entry reads as an unbulleted achievement line.
        _add_bullet(cur, ln, bulleted=False)
        return

    role = (
        "skill_line"
        if cur.section.kind == "skills"
        else ("summary" if cur.section.kind == "summary" else "freeform")
    )
    _add_loose(cur, ln, role)


_ENTRY_SECTIONS: frozenset[SectionKind] = frozenset(
    {"experience", "education", "projects", "volunteering", "certifications", "custom"}
)


def _has_content(section: Section) -> bool:
    """Does this section hold anything beyond its own heading?"""
    return bool(section.entries or section.loose_nodes)


def _open_section(
    cur: _Cursor,
    kind: SectionKind,
    title: str | None,
    ln: ParsedLine | None,
) -> None:
    if cur.section is not None:
        cur.sections.append(cur.section)
    index = len(cur.sections)
    section = Section(
        id=make_node_id("sec", index, kind),
        kind=kind,
        title=title,
    )
    if ln is not None and title:
        section.title_node = TextNode(
            id=make_node_id("nod", cur.next_seq(), "section_title"),
            role="section_title",
            text=title,
            anchor=ln.anchor,
        )
    cur.section = section
    cur.entry = None


def _open_entry(cur: _Cursor, ln: ParsedLine) -> None:
    assert cur.section is not None
    text = ln.text.strip()
    role, org, location = split_entry_heading(text)
    start, end = parse_date_range(text)
    entry = Entry(
        id=make_node_id("ent", cur.section.id, len(cur.section.entries)),
        role=role,
        org=org,
        location=location,
        start=start,
        end=end,
    )
    entry.heading_nodes.append(
        TextNode(
            id=make_node_id("nod", cur.next_seq(), "entry_role"),
            role="entry_role",
            text=text,
            anchor=ln.anchor,
        )
    )
    cur.section.entries.append(entry)
    cur.entry = entry


def _absorb_meta(cur: _Cursor, ln: ParsedLine) -> None:
    """Fold a stray location/dates line into the entry it describes."""
    entry = cur.entry
    assert entry is not None
    text = ln.text.strip()
    start, end = parse_date_range(text)
    if start and not entry.start:
        entry.start, entry.end = start, end
    remainder = split_entry_heading(text)[0]
    if remainder and not entry.location:
        entry.location = remainder
    entry.heading_nodes.append(
        TextNode(
            id=make_node_id("nod", cur.next_seq(), "entry_meta"),
            role="entry_meta",
            text=text,
            anchor=ln.anchor,
        )
    )


def _close_entry(cur: _Cursor) -> None:
    cur.entry = None


def _add_bullet(cur: _Cursor, ln: ParsedLine, *, bulleted: bool = True) -> None:
    assert cur.section is not None
    text = strip_bullet(ln.text) if bulleted else ln.text.strip()
    if not text:
        return
    node = TextNode(
        id=make_node_id("nod", cur.next_seq(), "bullet"),
        role="bullet",
        text=text,
        anchor=ln.anchor,
    )
    if cur.entry is not None:
        cur.entry.bullets.append(node)
    else:
        cur.section.loose_nodes.append(node)


def _add_loose(cur: _Cursor, ln: ParsedLine, role: str) -> None:
    assert cur.section is not None
    cur.section.loose_nodes.append(
        TextNode(
            id=make_node_id("nod", cur.next_seq(), role),
            role=role,  # type: ignore[arg-type]
            text=ln.text.strip(),
            anchor=ln.anchor,
        )
    )


# ── header ──────────────────────────────────────────────────────────────────


def _find_header_end(lines: list[ParsedLine]) -> int:
    """Where the name-and-contact block stops and the CV proper begins."""
    for i, ln in enumerate(lines[:12]):
        if classify_heading(ln.text.strip()) is not None:
            return i
        if i > 0 and looks_like_entry_heading(ln.text.strip()):
            return i
    return min(4, len(lines))


def _build_contact(header_lines: list[ParsedLine], *, all_lines: list[ParsedLine]) -> ContactBlock:
    if not header_lines:
        return ContactBlock()

    # The *name* has to come from the top of the document, but the contact
    # details do not: sidebar layouts park them under a "Contact" heading
    # partway down. Scanning everything finds them wherever they live, and an
    # email or phone number is unambiguous enough that a wider net is safe.
    bits = extract_contact_bits("\n".join(ln.text for ln in all_lines))

    name = _read_name(header_lines)
    # A first line that is really a contact row is not a name.
    if bits["email"] and bits["email"] in name:
        name_value: str | None = None
    elif len(name.split()) > 6 or not name:
        name_value = None
    else:
        name_value = name

    # "Berlin, Germany" — a short comma-joined phrase with no digits and no
    # address sign is a place, not a job title or a contact row.
    location = None
    for ln in header_lines[1:]:
        text = ln.text.strip()
        if (
            2 <= len(text.split()) <= 5
            and "," in text
            and "@" not in text
            and not any(ch.isdigit() for ch in text)
        ):
            location = text
            break

    return ContactBlock(
        name=name_value,
        email=bits["email"],  # type: ignore[arg-type]
        phone=bits["phone"],  # type: ignore[arg-type]
        location=location,
        links=bits["links"],  # type: ignore[arg-type]
    )


def _read_name(header_lines: list[ParsedLine]) -> str:
    """The person's name, rejoined if the layout broke it across lines.

    Narrow sidebar CVs routinely set a name one word per line. Those lines share
    the largest type size in the header, which is the signal we key on — so
    "Sofia" / "Ramos" becomes "Sofia Ramos" rather than just "Sofia".
    """
    first = header_lines[0]
    name = first.text.strip()
    if first.size_pt is None or len(name.split()) > 2:
        return name

    for line in header_lines[1:3]:
        text = line.text.strip()
        if line.size_pt != first.size_pt or not text:
            break
        if len(text.split()) > 2 or any(ch.isdigit() or ch == "@" for ch in text):
            break
        name = f"{name} {text}"
    return name


def _median_size(lines: list[ParsedLine]) -> float:
    sizes = [ln.size_pt for ln in lines if ln.size_pt]
    return statistics.median(sizes) if sizes else 10.5
