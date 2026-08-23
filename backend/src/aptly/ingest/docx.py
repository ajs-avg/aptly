"""Word (.docx) parser.

The best case for format preservation: a .docx is a structured document, so we
can edit the user's own file and hand it back with every font, margin and
tab-stop exactly as they left it.

Two details drive the design:

**Paragraph order must include tables.** ``document.paragraphs`` skips anything
inside a table, and two-column CVs are almost always laid out as a table. We
walk the body XML instead, so the flat paragraph index covers everything in
reading order and stays stable for the exporter to find again.

**A sentence is rarely one run.** Word splits ``<w:r>`` runs at every formatting
or spell-check boundary, so "Reduced ramp time by 50%" can be four runs. Each
line records the run span it covers, letting the exporter rewrite text while
preserving each run's own formatting.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterator

from docx import Document as open_docx
from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from aptly.ingest.builder import ParsedLine, build_document
from aptly.model.anchors import DocxAnchor
from aptly.model.document import CVDocument
from aptly.model.style import FontSpec, Margins, StyleProfile

DEFAULT_BODY_PT = 10.5


def parse_docx(
    path: str,
    *,
    doc_id: str,
    source_filename: str,
    content_hash: str,
) -> CVDocument:
    """Parse a .docx CV into the canonical model."""
    document = open_docx(path)
    warnings: list[str] = []

    entries = list(walk_paragraphs(document))
    lines: list[ParsedLine] = []

    for index, paragraph, table_path in entries:
        full = paragraph.text
        text = full.strip()
        if not text:
            continue
        # The span of the *stripped* text within the paragraph. The exporter
        # rewrites exactly this range, so leading indentation and trailing
        # whitespace the author put there survive untouched.
        char_start = len(full) - len(full.lstrip())
        char_end = len(full.rstrip())

        bold, italic, size = _resolve_run_style(paragraph)
        lines.append(
            ParsedLine(
                text=text,
                anchor=DocxAnchor(
                    paragraph_index=index,
                    char_start=char_start,
                    char_end=char_end,
                    run_start=0,
                    run_end=len(paragraph.runs),
                    table_path=table_path,
                ),
                bold=bold,
                italic=italic,
                size_pt=size,
                is_list_item=_is_list_item(paragraph),
            )
        )

    if any(tp is not None for _, _, tp in entries):
        warnings.append(
            "This CV uses a table for layout. Edits are applied inside the table, "
            "so your formatting is kept — but some ATS parse tables poorly."
        )

    return build_document(
        lines,
        doc_id=doc_id,
        source_format="docx",
        source_filename=source_filename,
        content_hash=content_hash,
        style_profile=_extract_style(document, lines),
        warnings=warnings,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Document walk
# ═══════════════════════════════════════════════════════════════════════════


def walk_paragraphs(
    document: DocxDocument,
) -> Iterator[tuple[int, Paragraph, tuple[int, int, int] | None]]:
    """Yield ``(flat_index, paragraph, table_path)`` in reading order.

    ``table_path`` is ``(table_index, row, column)`` when the paragraph sits in
    a table cell, else None. The exporter replays this exact walk, so the flat
    index is a stable address as long as no paragraph is added or removed —
    which the export path never does.
    """
    counter = 0
    table_counter = 0

    for block in _iter_blocks(document, document.element.body):
        if isinstance(block, Paragraph):
            yield counter, block, None
            counter += 1
        else:
            for row_idx, row in enumerate(block.rows):
                for col_idx, cell in enumerate(row.cells):
                    for cell_block in _iter_blocks(cell, cell._tc):
                        if isinstance(cell_block, Paragraph):
                            yield counter, cell_block, (table_counter, row_idx, col_idx)
                            counter += 1
                        else:
                            # Nested tables are rare in CVs; their paragraphs are
                            # still indexed so nothing is silently dropped.
                            for nested in _iter_blocks(cell_block, cell_block._tbl):
                                if isinstance(nested, Paragraph):
                                    yield counter, nested, (table_counter, row_idx, col_idx)
                                    counter += 1
            table_counter += 1


def _iter_blocks(parent: object, element: object) -> Iterator[Paragraph | Table]:
    for child in element.iterchildren():  # type: ignore[attr-defined]
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield Table(child, parent)


def _is_list_item(paragraph: Paragraph) -> bool:
    """Is this paragraph a Word list item?

    Checks the numbering properties first — that is what actually renders a
    bullet — and falls back to the style name for documents that fake lists
    with an indented style.
    """
    p_pr = paragraph._p.pPr
    if p_pr is not None and p_pr.numPr is not None:
        return True
    style_name = (paragraph.style.name or "").lower() if paragraph.style else ""
    return "list" in style_name


# ═══════════════════════════════════════════════════════════════════════════
# Style
# ═══════════════════════════════════════════════════════════════════════════


def _resolve_run_style(paragraph: Paragraph) -> tuple[bool, bool, float | None]:
    """Bold / italic / size for a paragraph, resolved through the style chain.

    ``run.font.size`` is None when the run inherits, so we fall back to the
    paragraph style and then the document default. A paragraph counts as bold
    only when *most* of its text is bold — one bolded word inside a bullet must
    not make the whole line look like a heading.
    """
    runs = [r for r in paragraph.runs if r.text.strip()]
    if not runs:
        return False, False, None

    bold_chars = sum(len(r.text) for r in runs if _inherit_bold(r, paragraph))
    italic_chars = sum(len(r.text) for r in runs if _inherit_italic(r, paragraph))
    total = sum(len(r.text) for r in runs) or 1

    sizes = [s for s in (_inherit_size(r, paragraph) for r in runs) if s]
    size = max(sizes) if sizes else None

    return bold_chars / total > 0.6, italic_chars / total > 0.6, size


def _inherit_bold(run: object, paragraph: Paragraph) -> bool:
    value = run.font.bold  # type: ignore[attr-defined]
    if value is not None:
        return bool(value)
    style = paragraph.style
    return bool(style and style.font.bold)


def _inherit_italic(run: object, paragraph: Paragraph) -> bool:
    value = run.font.italic  # type: ignore[attr-defined]
    if value is not None:
        return bool(value)
    style = paragraph.style
    return bool(style and style.font.italic)


def _inherit_size(run: object, paragraph: Paragraph) -> float | None:
    size = run.font.size  # type: ignore[attr-defined]
    if size is not None:
        return float(size.pt)
    style = paragraph.style
    if style and style.font.size is not None:
        return float(style.font.size.pt)
    return None


def _resolve_family(document: DocxDocument) -> str:
    try:
        normal = document.styles["Normal"]
        if normal.font.name:
            return str(normal.font.name)
    except KeyError:
        pass
    return "Calibri"


def _extract_style(document: DocxDocument, lines: list[ParsedLine]) -> StyleProfile:
    """Measure the document's visual identity for preview and skim scoring."""
    family = _resolve_family(document)

    sizes = [ln.size_pt for ln in lines if ln.size_pt]
    body_pt = _mode(sizes) if sizes else DEFAULT_BODY_PT

    heading_sizes = [ln.size_pt for ln in lines if ln.size_pt and ln.bold and ln.size_pt > body_pt]
    heading_pt = _mode(heading_sizes) if heading_sizes else body_pt + 1.5
    name_pt = max(sizes) if sizes else body_pt + 9

    section = document.sections[0] if document.sections else None
    margins = Margins()
    page_w, page_h = 595.28, 841.89
    columns = 1

    if section is not None:
        if section.page_width and section.page_height:
            page_w, page_h = float(section.page_width.pt), float(section.page_height.pt)
        margins = Margins(
            top_pt=float(section.top_margin.pt) if section.top_margin else 54.0,
            right_pt=float(section.right_margin.pt) if section.right_margin else 54.0,
            bottom_pt=float(section.bottom_margin.pt) if section.bottom_margin else 54.0,
            left_pt=float(section.left_margin.pt) if section.left_margin else 54.0,
        )

    # A layout table with two populated columns is a two-column CV.
    if any(ln.anchor.kind == "docx" and ln.anchor.table_path for ln in lines):
        cols = {
            ln.anchor.table_path[2]
            for ln in lines
            if ln.anchor.kind == "docx" and ln.anchor.table_path
        }
        columns = 2 if len(cols) > 1 else 1

    upper_headings = [
        ln.text for ln in lines if ln.bold and ln.text.isupper() and len(ln.text.split()) <= 4
    ]

    return StyleProfile(
        page_width_pt=page_w,
        page_height_pt=page_h,
        margins=margins,
        columns=columns,
        body=FontSpec(family=family, size_pt=body_pt),
        name=FontSpec(family=family, size_pt=name_pt, bold=True),
        section_heading=FontSpec(family=family, size_pt=heading_pt, bold=True),
        entry_heading=FontSpec(family=family, size_pt=body_pt + 0.5, bold=True),
        heading_transform="upper" if len(upper_headings) >= 2 else "none",
    )


def _mode(values: list[float]) -> float:
    """Most common value, rounded to a quarter point to absorb jitter."""
    counts = Counter(round(v * 4) / 4 for v in values)
    return counts.most_common(1)[0][0]
