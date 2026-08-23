"""Word exporter — edits the user's own file.

The highest-fidelity path we have. We reopen the bytes the person uploaded,
walk to each paragraph that changed, and rewrite only the characters that
differ. Styles, themes, tables, headers, tab stops, the template they picked —
none of it is regenerated, because none of it is touched.

The paragraph index in each anchor is resolved by replaying the very same walk
the parser used, so the two always agree.
"""

from __future__ import annotations

from io import BytesIO

from docx import Document as open_docx

from aptly.export.runs import replace_paragraph
from aptly.ingest.docx import walk_paragraphs
from aptly.model.document import CVDocument


def export_docx(original: bytes, document: CVDocument) -> bytes:
    """Write ``document``'s current text back into the original .docx bytes.

    Only nodes whose text differs from the file are rewritten, so exporting an
    untouched document returns a byte-identical body.
    """
    handle = open_docx(BytesIO(original))
    paragraphs = {index: paragraph for index, paragraph, _ in walk_paragraphs(handle)}

    for node in document.nodes:
        anchor = node.anchor
        if anchor.kind != "docx":
            continue
        paragraph = paragraphs.get(anchor.paragraph_index)
        if paragraph is None:
            continue
        replace_paragraph(paragraph, anchor.char_start, anchor.char_end, node.text)

    out = BytesIO()
    handle.save(out)
    return out.getvalue()
