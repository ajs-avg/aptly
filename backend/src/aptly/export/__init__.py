"""Export — write an edited :class:`CVDocument` back out.

One entry point, :func:`export_cv`. It takes the bytes the person originally
uploaded plus their edited document, and returns bytes in the *same format they
gave us*.

Two guarantees this module exists to provide:

1. **Nothing changed means nothing changes.** We re-parse the original to get a
   baseline and rewrite only the nodes whose text actually differs. Exporting an
   untouched CV returns the original bytes verbatim — no re-escaping drift, no
   reformatting, no surprises.
2. **We never rebuild what we can edit.** .docx, .tex, .txt and .md are all
   edited in place. Only PDF is rebuilt, because a PDF genuinely cannot be
   edited — and when that happens the user is told.
"""

from __future__ import annotations

from dataclasses import dataclass

from aptly.errors import UnsupportedFormatError
from aptly.ingest import _decode, parse_cv
from aptly.model.document import CVDocument, TextNode


@dataclass(frozen=True, slots=True)
class ExportResult:
    """Exported bytes plus what the user should know about them."""

    data: bytes
    filename: str
    media_type: str
    #: True when the file was reconstructed rather than edited, which only
    #: happens for PDF. Surfaced in the UI — a rebuild is never silent.
    rebuilt: bool = False
    notes: tuple[str, ...] = ()

    @property
    def changed(self) -> bool:
        return bool(self.notes) or self.rebuilt


MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "tex": "application/x-tex",
    "txt": "text/plain; charset=utf-8",
    "md": "text/markdown; charset=utf-8",
}


def export_cv(original: bytes, document: CVDocument, target: str | None = None) -> ExportResult:
    """Write ``document`` out, in its original format or a chosen one.

    Two genuinely different operations behind one entry point, and which one
    happens is decided by ``target``:

    - **No target, or the source format.** An *edit*. Only changed lines are
      rewritten and everything else — fonts, spacing, headers, the lot — is the
      person's own. An untouched CV round-trips byte for byte.
    - **A different format.** A *rebuild*, via :mod:`aptly.export.render`. The
      content is exactly what was approved; the layout is ours. Someone who
      uploaded a .docx and needs a PDF for an application form gets one without
      opening Word, and is told plainly that it is a new document.
    """
    fmt = document.source_format
    if target and target != fmt:
        return _rebuild_as(document, target)

    # No original bytes means there is no original to edit, so the only honest
    # export is a rebuild — and saying so is the whole point of `rebuilt`.
    #
    # Two ordinary flows arrive here with nothing:
    #
    # - A **pasted** CV. There was never a file; `source_format` is only "txt"
    #   because that is what pasted text is.
    # - The **rebuilt** CV, either way it was started. The browser deliberately
    #   sends the uploaded file only for the tailored side, because the second
    #   document is not that file and must not be written through it.
    #
    # Falling into the edit path with empty bytes did not fail loudly. It parsed
    # nothing, concluded nothing had changed, and returned the empty original —
    # so downloading a pasted CV as .txt or .md handed over a **zero-byte file**.
    # For .docx it did fail loudly, deep in the exporter, with `BadZipFile`.
    if not original:
        return _rebuild_as(document, target or fmt)

    changed = changed_nodes(original, document)
    stem = _stem(document.source_filename)

    if fmt == "docx":
        from aptly.export.docx import export_docx

        data = export_docx(original, document) if changed else original
        return ExportResult(data, f"{stem}.docx", MEDIA_TYPES["docx"])

    if fmt in {"tex", "txt", "md"}:
        from aptly.export.sources import export_tex, export_text

        if not changed:
            return ExportResult(original, f"{stem}.{fmt}", MEDIA_TYPES[fmt])
        source = _decode(original)
        writer = export_tex if fmt == "tex" else export_text
        return ExportResult(
            writer(source, changed).encode("utf-8"), f"{stem}.{fmt}", MEDIA_TYPES[fmt]
        )

    if fmt == "pdf":
        from aptly.export.pdf import rebuild_pdf

        return rebuild_pdf(document, filename=f"{stem}.pdf")

    raise UnsupportedFormatError(
        f"Aptly cannot write {fmt} files.",
        hint="Download as .docx or plain text instead.",
    )


def _rebuild_as(document: CVDocument, target: str) -> ExportResult:
    """Build the document afresh in a format it did not arrive in."""
    from aptly.export.render import REBUILD_NOTE, render

    if target not in MEDIA_TYPES:
        raise UnsupportedFormatError(
            f"Aptly cannot write {target} files.",
            hint="Choose .docx, .pdf, .tex, .md or plain text.",
        )

    stem = _stem(document.source_filename)
    return ExportResult(
        data=render(document, target),
        filename=f"{stem}.{target}",
        media_type=MEDIA_TYPES[target],
        rebuilt=True,
        notes=(REBUILD_NOTE,),
    )


def changed_nodes(original: bytes, document: CVDocument) -> list[TextNode]:
    """Which nodes differ from the file as it was uploaded.

    Re-parsing the original is cheap next to being wrong: it means an export
    touches only genuinely edited text, and an untouched document round-trips
    byte for byte.
    """
    try:
        baseline = parse_cv(original, document.source_filename, doc_id=document.doc_id)
    except Exception:
        return list(document.nodes)

    before = {node.id: node.text for node in baseline.nodes}
    return [node for node in document.nodes if before.get(node.id, node.text) != node.text]


def _stem(filename: str) -> str:
    stem = filename.rsplit("/", 1)[-1]
    return stem.rsplit(".", 1)[0] if "." in stem else stem


#: What a CV can be downloaded as, whatever it arrived as.
TARGET_FORMATS: tuple[str, ...] = ("docx", "pdf", "tex", "md", "txt")

__all__ = [
    "MEDIA_TYPES",
    "TARGET_FORMATS",
    "ExportResult",
    "changed_nodes",
    "export_cv",
]
