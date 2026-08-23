"""PDF export — a style-matched rebuild, not an edit.

A PDF stores glyphs at coordinates, not sentences, so there is nothing to edit
in place: a replacement line one word longer would overlap its neighbour. What
we can do is reproduce the document. The parser measured the original's fonts,
sizes, colours, margins, heading treatment and bullet glyph; this module feeds
those back into Typst and renders a close visual match.

Typst rather than an HTML engine because it is a single self-contained wheel
with no system libraries behind it — no Pango, no cairo, nothing to install on
the machine or bake into a deploy image.

The result is honest, not magic. It looks close, it is ATS-clean, and from this
point on the CV is genuinely editable. The user is told all of that.
"""

from __future__ import annotations

import os
import re
import tempfile
from contextlib import suppress

import typst

from aptly.errors import ParseError
from aptly.model.document import CVDocument, Section
from aptly.model.style import FontSpec, StyleProfile

_REBUILD_NOTE = (
    "Your PDF was rebuilt to match the original's fonts, spacing and layout. "
    "It is a close copy rather than a byte-for-byte edit — PDFs cannot be edited "
    "in place. Upload the .docx next time for a pixel-perfect result."
)


def rebuild_pdf(document: CVDocument, *, filename: str):
    """Render ``document`` to PDF in the style of the file it came from."""
    from aptly.export import MEDIA_TYPES, ExportResult

    source = to_typst(document)

    tex_fd, source_path = tempfile.mkstemp(suffix=".typ", prefix="aptly-")
    try:
        with os.fdopen(tex_fd, "w", encoding="utf-8") as handle:
            handle.write(source)
        data = typst.compile(source_path)
    except Exception as exc:
        raise ParseError(
            "Aptly could not rebuild this CV as a PDF.",
            hint="Download it as .docx or plain text instead — the text is unaffected.",
        ) from exc
    finally:
        with suppress(OSError):
            os.unlink(source_path)

    if isinstance(data, list):  # typst returns a list of pages for some formats
        data = data[0]

    return ExportResult(
        data=data,
        filename=filename,
        media_type=MEDIA_TYPES["pdf"],
        rebuilt=True,
        notes=(_REBUILD_NOTE,),
    )


# ═══════════════════════════════════════════════════════════════════════════
# Typst generation
# ═══════════════════════════════════════════════════════════════════════════


def to_typst(document: CVDocument) -> str:
    """Render the canonical model as a Typst source document."""
    style = document.style_profile
    out: list[str] = [_preamble(style)]

    contact = document.contact
    if contact.name:
        out.append(_styled(contact.name, style.name, block=True))

    details = [d for d in (contact.email, contact.phone, contact.location) if d]
    if details:
        out.append(_styled("  ·  ".join(details), _muted(style.body), block=True))
    if contact.links:
        out.append(_styled("  ·  ".join(contact.links), _muted(style.body), block=True))

    for section in document.sections:
        if section.kind == "header":
            continue
        out.append(_section(section, style))

    return "\n".join(out) + "\n"


def _preamble(style: StyleProfile) -> str:
    margins = style.margins
    body = style.body
    return "\n".join(
        [
            "#set page(",
            f"  width: {style.page_width_pt}pt, height: {style.page_height_pt}pt,",
            f"  margin: (top: {margins.top_pt}pt, right: {margins.right_pt}pt,",
            f"           bottom: {margins.bottom_pt}pt, left: {margins.left_pt}pt),",
            ")",
            f"#set text(font: ({_font_stack(body.family)}), size: {body.size_pt}pt, "
            f'fill: rgb("{body.color}"))',
            f"#set par(justify: false, leading: {max(0.4, style.line_spacing - 0.65)}em)",
            f"#set list(marker: [{_escape(style.bullet_glyph)}], indent: {style.bullet_indent_pt}pt)",
            "",
        ]
    )


def _section(section: Section, style: StyleProfile) -> str:
    out: list[str] = []

    if section.title:
        title = _transform(section.title, style.heading_transform)
        out.append(f"#v({style.heading_space_before_pt}pt, weak: true)")
        out.append(_styled(title, style.section_heading, block=True))
        if style.heading_rule:
            colour = style.accent_color or "#E2E6E8"
            out.append(f'#line(length: 100%, stroke: 0.5pt + rgb("{colour}"))')
        out.append(f"#v({style.heading_space_after_pt}pt, weak: true)")

    # Consecutive bullets become one list. Rendering them as separate paragraphs
    # was the most visible way the rebuild diverged from the original: a CV whose
    # projects were bulleted came back as flat prose.
    run: list[str] = []
    for node in section.loose_nodes:
        if node.role == "bullet":
            run.append(node.text)
            continue
        out.extend(_flush_bullets(run))
        out.append(_paragraph(node.text, style))
    out.extend(_flush_bullets(run))

    for entry in section.entries:
        out.append(_entry(entry, style))

    return "\n".join(out)


def _flush_bullets(run: list[str]) -> list[str]:
    if not run:
        return []
    block = ["#list(", *(f"  [{_escape(text)}]," for text in run), ")"]
    run.clear()
    return block


#: "Programming:", "Core CS:", "Machine Learning & Data Science:" — a label that
#: introduces the rest of the line. CVs set these in bold, and the canonical
#: model stores plain text per node, so the emphasis has to be re-derived here.
_INLINE_LABEL = re.compile(r"^([A-Z][\w &/+.-]{1,34}):\s+(.*)$", re.DOTALL)


def _paragraph(text: str, style: StyleProfile) -> str:
    """A body paragraph, restoring the bold lead-in label if there is one."""
    match = _INLINE_LABEL.match(text.strip())
    if not match:
        return _styled(text, style.body, block=True)

    label, rest = match.group(1), match.group(2)
    bold = FontSpec(
        family=style.body.family,
        size_pt=style.body.size_pt,
        bold=True,
        color=style.body.color,
    )
    return f"{_styled(f'{label}:', bold)} {_styled(rest, style.body)}\n"


def _entry(entry, style: StyleProfile) -> str:
    out: list[str] = [f"#v({style.paragraph_space_pt}pt, weak: true)"]

    left = " — ".join(part for part in (entry.role, entry.org) if part)
    right = " · ".join(part for part in (entry.location, _dates(entry)) if part)

    if left and right:
        # Inside #grid(...) we are already in code mode, so the arguments take
        # the bare `text(..)` form — a second `#` would be a syntax error.
        out.append(
            f"#grid(columns: (1fr, auto), "
            f"{_text_call(left, style.entry_heading)}, "
            f"{_text_call(right, _muted(style.body))})"
        )
    elif left:
        out.append(_styled(left, style.entry_heading, block=True))
    elif right:
        out.append(_styled(right, _muted(style.body), block=True))

    if entry.bullets:
        out.append("#list(")
        out.extend(f"  [{_escape(bullet.text)}]," for bullet in entry.bullets)
        out.append(")")

    return "\n".join(out)


def _dates(entry) -> str:
    if entry.start and entry.end:
        return f"{entry.start} – {entry.end}"
    return entry.start or entry.end or ""


def _text_call(text: str, font: FontSpec) -> str:
    """A bare ``text(..)[..]`` call, for use where Typst is already in code mode."""
    weight = ', weight: "bold"' if font.bold else ""
    style = ', style: "italic"' if font.italic else ""
    return (
        f'text(size: {font.size_pt}pt, fill: rgb("{font.color}"){weight}{style})[{_escape(text)}]'
    )


def _styled(text: str, font: FontSpec, *, block: bool = False) -> str:
    """A ``#text(..)[..]`` call for markup context."""
    rendered = f"#{_text_call(text, font)}"
    return f"{rendered}\n" if block else rendered


def _muted(body: FontSpec) -> FontSpec:
    """The secondary voice: same family, a touch smaller, slate rather than ink."""
    return FontSpec(
        family=body.family,
        size_pt=max(7.0, body.size_pt - 1.5),
        color="#5A6270",
    )


def _font_stack(family: str) -> str:
    """The measured family first, then fallbacks Typst can always resolve."""
    seen: list[str] = []
    for candidate in (family, "Helvetica", "Arial", "Liberation Sans", "DejaVu Sans"):
        if candidate and candidate not in seen:
            seen.append(candidate)
    return ", ".join(f'"{name}"' for name in seen)


def _transform(text: str, transform: str) -> str:
    if transform == "upper":
        return text.upper()
    if transform == "title":
        return text.title()
    return text


#: Typst markup characters. Escaped so a CV containing "C#", "*", "_" or an
#: email address renders as written instead of turning into markup.
_SPECIALS = "\\#[]*_`$<>@=~"


def _escape(text: str) -> str:
    out = text.replace("\\", "\\\\")
    for char in _SPECIALS[1:]:
        out = out.replace(char, f"\\{char}")
    return out
