"""Reading a CV from its pixels when reading its text stream failed.

This is a *fallback*, and the shape of the module follows from that. It does not
try to be a better parser than :mod:`aptly.ingest.pdf`; it does exactly one job
that the text extractor cannot do — get the characters off a page that has no
usable text layer — and then hands the result straight back into the ordinary
pipeline.

That handover is the important design decision. Vision returns *lines in reading
order*, not a finished document. Section classification, entry grouping, contact
detection, bullet handling and stable ids are all the existing code, unchanged,
so a vision-read CV behaves identically to every other CV from that point on and
there is no second structural implementation to keep in step.

What is lost is the ability to write back. A document read from pixels has no
character spans in any file, so every node gets a :class:`SyntheticAnchor` and
the exporter rebuilds rather than edits. The user is told this.
"""

from __future__ import annotations

from dataclasses import dataclass

from aptly.errors import ParseError
from aptly.ingest.builder import ParsedLine, build_document
from aptly.llm.client import FilePart, GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.anchors import SyntheticAnchor
from aptly.model.document import CVDocument
from aptly.model.style import StyleProfile
from aptly.vision.prompts import VISION_SYSTEM, vision_user
from aptly.vision.schemas import VisionRead

log = get_logger(__name__)

#: Gemini accepts inline document bytes up to 20 MB; past that the File API is
#: required. A CV over this is not a CV, it is a portfolio with photographs.
MAX_INLINE_BYTES = 18 * 1024 * 1024

_REBUILD_NOTE = (
    "This PDF had no usable text layer, so Aptly read it as pages and rebuilt it. "
    "The wording is your own — check it against the original before sending, and "
    "upload the .docx next time for an exact result."
)


@dataclass(frozen=True, slots=True)
class VisionResult:
    document: CVDocument
    usage: Usage


async def read_pdf_with_vision(
    data: bytes,
    *,
    doc_id: str,
    source_filename: str,
    content_hash: str,
    client: GeminiClient,
    reasons: list[str] | None = None,
) -> VisionResult:
    """Read a PDF as pages and return it as a :class:`CVDocument`.

    ``reasons`` are the extraction-quality complaints that triggered this, and
    they are carried into the document's warnings — the user gets told what went
    wrong with their file, not just that something did.
    """
    if len(data) > MAX_INLINE_BYTES:
        raise ParseError(
            "That PDF is too large to read as pages.",
            hint="Upload the .docx, or export a text-only PDF under 18 MB.",
        )

    completion = await client.structured(
        model=client.vision_model,
        system=VISION_SYSTEM,
        user=vision_user(),
        schema=VisionRead,
        files=[FilePart(data=data, mime_type="application/pdf")],
        # Transcription, not authorship. Any creativity here is a fabrication.
        temperature=0.0,
        purpose="vision_read",
    )
    read = completion.value

    log.info(
        "vision.read",
        lines=len(read.lines),
        pages=read.pages,
        confident=read.fully_legible,
        output_tokens=completion.usage.output_tokens,
    )

    if not read.lines:
        raise ParseError(
            "Aptly could not read any text from that PDF, even as pages.",
            hint="It may be blank, or an image at too low a resolution. "
            "Upload the .docx or paste your CV as text.",
        )

    warnings = [_REBUILD_NOTE]
    warnings.extend(reasons or [])
    if not read.fully_legible:
        warnings.append(
            "Parts of the page were hard to read. Check anything that looks wrong "
            "before you send this."
        )
    if read.notes:
        warnings.extend(read.notes)

    document = build_document(
        [
            ParsedLine(
                text=line.text,
                anchor=SyntheticAnchor(origin="vision", index=index, page=line.page),
                bold=line.bold,
                italic=False,
                size_pt=_size_for(line.heading_level),
                is_list_item=line.bullet,
            )
            for index, line in enumerate(read.lines)
        ],
        doc_id=doc_id,
        source_format="pdf",
        source_filename=source_filename,
        content_hash=content_hash,
        # Nothing was measured, so nothing is claimed. The rebuild uses its
        # defaults rather than a style profile invented from a description.
        style_profile=StyleProfile(inferred=True),
        warnings=warnings,
    )
    return VisionResult(document=document, usage=completion.usage)


def _size_for(heading_level: int) -> float:
    """A point size standing in for the heading level the model reported.

    The downstream classifier keys off relative size, so the absolute numbers
    matter less than the ordering. Body text is the modal size, which is what
    makes anything larger read as a heading.
    """
    return {0: 10.0, 1: 18.0, 2: 13.0}.get(heading_level, 10.0)


__all__ = ["MAX_INLINE_BYTES", "VisionResult", "read_pdf_with_vision"]
