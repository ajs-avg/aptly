"""Ingest — turn an uploaded file into a :class:`CVDocument`.

One entry point, :func:`parse_cv`, which dispatches on file type and returns the
canonical model. Callers never need to know which format they were handed.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from pathlib import Path

from aptly.errors import ParseError, UnsupportedFormatError
from aptly.ingest.builder import ParsedLine, build_document
from aptly.model.document import CVDocument, make_node_id

SUPPORTED_EXTENSIONS = frozenset({".docx", ".pdf", ".tex", ".txt", ".md", ".markdown"})

#: Extensions people try that we deliberately do not accept, with the reason.
_KNOWN_REJECTS = {
    ".doc": "Word 97-2003 files are not supported. Open it in Word and save as .docx.",
    ".pages": "Apple Pages files are not supported. Export as .docx or .pdf first.",
    ".odt": "OpenDocument files are not supported. Export as .docx first.",
    ".rtf": "Rich Text files are not supported. Save as .docx first.",
    ".jpg": "Images cannot be read. Upload the original .docx or .pdf.",
    ".jpeg": "Images cannot be read. Upload the original .docx or .pdf.",
    ".png": "Images cannot be read. Upload the original .docx or .pdf.",
}


def parse_cv(
    data: bytes,
    filename: str,
    *,
    doc_id: str | None = None,
) -> CVDocument:
    """Parse uploaded bytes into a :class:`CVDocument`.

    The content hash is taken over the original bytes before anything else, so
    months later we can prove the stored file is the one that was sent.
    """
    extension = Path(filename).suffix.lower()

    if extension in _KNOWN_REJECTS:
        raise UnsupportedFormatError(
            f"Aptly cannot read {extension} files.", hint=_KNOWN_REJECTS[extension]
        )
    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(
            f"Aptly cannot read {extension or 'this'} files.",
            hint="Upload a .docx, .pdf, .tex, .txt or .md file — or paste your CV as text.",
        )

    content_hash = hashlib.sha256(data).hexdigest()
    doc_id = doc_id or make_node_id("doc", content_hash)

    try:
        if extension == ".docx":
            from aptly.ingest.docx import parse_docx

            with _spooled(data, ".docx") as path:
                return parse_docx(
                    path,
                    doc_id=doc_id,
                    source_filename=filename,
                    content_hash=content_hash,
                )

        if extension == ".pdf":
            from aptly.ingest.pdf import parse_pdf

            with _spooled(data, ".pdf") as path:
                return parse_pdf(
                    path,
                    doc_id=doc_id,
                    source_filename=filename,
                    content_hash=content_hash,
                )

        if extension == ".tex":
            from aptly.ingest.tex import parse_tex

            return parse_tex(
                _decode(data),
                doc_id=doc_id,
                source_filename=filename,
                content_hash=content_hash,
            )

        from aptly.ingest.text import parse_text

        return parse_text(
            _decode(data),
            doc_id=doc_id,
            source_filename=filename,
            content_hash=content_hash,
            is_markdown=extension in {".md", ".markdown"},
        )

    except (UnsupportedFormatError, ParseError):
        raise
    except Exception as exc:
        raise ParseError(
            f"Aptly could not read {filename}.",
            hint="The file may be corrupted or password-protected. "
            "Try re-saving it, or paste your CV as text instead.",
        ) from exc


def parse_pasted(text: str, *, doc_id: str | None = None) -> CVDocument:
    """Parse a CV the user pasted rather than uploaded."""
    data = text.encode("utf-8")
    content_hash = hashlib.sha256(data).hexdigest()
    from aptly.ingest.text import looks_like_markdown, parse_text

    return parse_text(
        text,
        doc_id=doc_id or make_node_id("doc", content_hash),
        source_filename="pasted.txt",
        content_hash=content_hash,
        # Sniffed, because a paste box cannot ask what syntax the clipboard is
        # in — and most pasted CVs come from somewhere that emits Markdown.
        is_markdown=looks_like_markdown(text),
    )


@contextmanager
def _spooled(data: bytes, suffix: str) -> Iterator[str]:
    """Write bytes to a temp file for libraries that need a path, then clean up."""
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="aptly-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        yield path
    finally:
        with suppress(OSError):
            os.unlink(path)


def _decode(data: bytes) -> str:
    """Decode text bytes, tolerating the encodings CVs actually arrive in."""
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


__all__ = [
    "SUPPORTED_EXTENSIONS",
    "CVDocument",
    "ParsedLine",
    "build_document",
    "parse_cv",
    "parse_pasted",
]
