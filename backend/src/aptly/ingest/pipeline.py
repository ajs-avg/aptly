"""Ingest with a fallback: read the text, and if that failed, read the pixels.

:func:`aptly.ingest.parse_cv` stays synchronous and free — it is the path almost
every upload takes, and it should not need a network or a key. This module wraps
it with the one decision that does: whether the parse was good enough to keep.

The order matters and is the user's own instruction: *try the cheap read first,
and only if it did not get the whole thing, pay for vision.* Most PDFs have a
perfectly good text layer, and re-reading those as images would cost ten times
as much, take several seconds longer, and produce a worse result — because the
text layer is exact and a transcription is not.

Failure policy is deliberately lopsided. A bad text parse escalates to vision.
A failed vision call does **not** fail the upload: the user keeps the text parse
plus an honest warning. Losing a working — if imperfect — CV because a fallback
was unavailable would be a worse outcome than the problem it was solving.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from aptly.config import Settings, get_settings
from aptly.errors import AptlyError
from aptly.ingest import parse_cv
from aptly.ingest.pdf import PdfParse
from aptly.ingest.quality import ExtractionQuality, assess_extraction
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger
from aptly.model.document import CVDocument, make_node_id

log = get_logger(__name__)


@dataclass(slots=True)
class IngestReport:
    """The document, plus how it was obtained and how well."""

    document: CVDocument
    quality: ExtractionQuality
    #: True when the pixels were read because the text layer was not good enough.
    used_vision: bool = False
    #: Set when vision was warranted but could not be run or did not work.
    vision_error: str | None = None
    cost_usd: float = 0.0

    @property
    def warnings(self) -> list[str]:
        return list(self.document.warnings)


@dataclass(slots=True)
class _Attempt:
    document: CVDocument
    quality: ExtractionQuality
    pages: int = 1
    raw_text: str = ""


async def ingest_cv(
    data: bytes,
    filename: str,
    *,
    settings: Settings | None = None,
    client: GeminiClient | None = None,
) -> IngestReport:
    """Parse an uploaded CV, escalating to vision when the text parse is poor."""
    settings = settings or get_settings()
    attempt = _read(data, filename)

    if not _should_escalate(filename, attempt.quality, settings):
        return IngestReport(document=attempt.document, quality=attempt.quality)

    log.info(
        "ingest.escalating_to_vision",
        filename=Path(filename).name,
        score=round(attempt.quality.score, 3),
        reasons=attempt.quality.reasons,
    )

    try:
        from aptly.vision import read_pdf_with_vision

        content_hash = hashlib.sha256(data).hexdigest()
        result = await read_pdf_with_vision(
            data,
            doc_id=make_node_id("doc", content_hash),
            source_filename=filename,
            content_hash=content_hash,
            client=client or GeminiClient(settings),
            reasons=attempt.quality.reasons,
        )
    except AptlyError as exc:
        return _vision_failed(attempt, exc.detail)
    except Exception as exc:  # network, credentials, quota — none are fatal here
        log.warning("ingest.vision_failed", error=str(exc)[:300])
        return _vision_failed(attempt, "The page reader was unavailable.")

    # Trust, but check. A transcription that recovered *less* than the text
    # layer is a worse answer arrived at expensively, and it happens — a model
    # can stop after page one.
    after = assess_extraction(result.document, pages=attempt.pages)
    if after.score < attempt.quality.score:
        log.warning(
            "ingest.vision_worse",
            before=round(attempt.quality.score, 3),
            after=round(after.score, 3),
        )
        return _vision_failed(attempt, "Reading the pages did not recover more than the text did.")

    log.info(
        "ingest.vision_used",
        before=round(attempt.quality.score, 3),
        after=round(after.score, 3),
        cost_usd=round(result.usage.cost_usd, 5),
    )
    return IngestReport(
        document=result.document,
        quality=after,
        used_vision=True,
        cost_usd=result.usage.cost_usd,
    )


def _read(data: bytes, filename: str) -> _Attempt:
    """The ordinary parse, plus the evidence needed to judge it."""
    if Path(filename).suffix.lower() == ".pdf":
        content_hash = hashlib.sha256(data).hexdigest()
        parse = _spooled_pdf(data, filename, content_hash)
        return _Attempt(
            document=parse.document,
            quality=assess_extraction(parse.document, pages=parse.pages, raw_text=parse.raw_text),
            pages=parse.pages,
            raw_text=parse.raw_text,
        )

    document = parse_cv(data, filename)
    return _Attempt(document=document, quality=assess_extraction(document))


def _spooled_pdf(data: bytes, filename: str, content_hash: str) -> PdfParse:
    from aptly.ingest import _spooled
    from aptly.ingest.pdf import parse_pdf_detailed

    with _spooled(data, ".pdf") as path:
        return parse_pdf_detailed(
            path,
            doc_id=make_node_id("doc", content_hash),
            source_filename=filename,
            content_hash=content_hash,
        )


def _should_escalate(filename: str, quality: ExtractionQuality, settings: Settings) -> bool:
    """Only PDFs, and only when the text layer genuinely failed.

    The other formats store their text as text. A .docx that will not parse is
    broken in a way a transcription cannot repair, and paying a vision call to
    discover that helps nobody.
    """
    if Path(filename).suffix.lower() != ".pdf":
        return False
    return quality.needs_vision(settings.vision_fallback_below)


def _vision_failed(attempt: _Attempt, message: str) -> IngestReport:
    """Keep the text parse, and be honest about what happened."""
    document = attempt.document
    document.warnings = [
        *document.warnings,
        f"{message} Aptly used the text it could extract, which looks incomplete — "
        "check the preview, and upload the .docx if anything is missing.",
    ]
    return IngestReport(
        document=document,
        quality=attempt.quality,
        vision_error=message,
    )


__all__ = ["IngestReport", "ingest_cv"]
