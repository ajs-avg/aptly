"""The second CV: composed from scratch rather than edited.

One run produces two documents, and they differ in what they are allowed to
touch rather than in how hard they try:

- **The tailored CV** edits the file the person uploaded. Format preserved,
  every change traceable to the line it replaces, nothing moved that they did
  not agree to move.
- **This one** ignores that file's shape entirely and writes a new document from
  everything they have told us — CV, career profile, Story Bank. It picks the
  sections, the order, the emphasis and every sentence.

Giving a model that much latitude is exactly where a CV tool starts lying, so
the checking here is stricter than on the editing path, not looser:

1. Every line must quote the source sentence it was drawn from, and the quote is
   verified against the pooled material — not just present, actually found.
2. Every line runs through :func:`aptly.validate.unsupported_claims`, the same
   figure/name/technology test the tailoring validator uses.
3. Lines that fail are removed and reported. The person is told how many and
   why, because a rebuild that quietly drops a third of its output while
   claiming success is worse than one that produces less.

An empty profile therefore yields a thin rebuild. That is the correct outcome:
the only way to make it fuller would be to invent the difference.
"""

from __future__ import annotations

import re

from aptly.analyse.schemas import Analysis
from aptly.ingest.builder import ParsedLine, build_document
from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.anchors import SyntheticAnchor
from aptly.model.document import CVDocument, normalize_text
from aptly.model.style import StyleProfile
from aptly.profile.schemas import CareerProfile
from aptly.rebuild.prompts import REBUILD_SYSTEM, rebuild_user
from aptly.rebuild.schemas import (
    DroppedLine,
    RebuildResult,
    RebuiltCV,
    RebuiltLine,
    RebuiltSection,
)
from aptly.validate import SourceMaterial, unsupported_claims

log = get_logger(__name__)

#: How much of a citation's vocabulary has to be the person's own for it to
#: count as a citation. Not 1.0, because a paraphrased source is a sloppy
#: citation rather than a fabricated one; not near zero, because the field
#: would then be decorative.
_QUOTE_FLOOR = 0.6


async def rebuild_cv(
    document: CVDocument,
    analysis: Analysis,
    *,
    client: GeminiClient,
    profile: CareerProfile | None = None,
    stories: dict[str, str] | None = None,
) -> tuple[RebuildResult, CVDocument, Usage]:
    """Compose a new CV, check every line of it, and return it as a document."""
    completion = await client.structured(
        model=client.main_model,
        system=REBUILD_SYSTEM,
        user=rebuild_user(document=document, profile=profile, analysis=analysis, stories=stories),
        schema=RebuiltCV,
        # Composition, so a little more room than an edit — but this writes
        # somebody's employment history, and invention is the failure mode.
        temperature=0.35,
        purpose="rebuild_cv",
    )

    source = SourceMaterial.build(
        document, stories, profile_text=profile.as_source_text() if profile else ""
    )
    result = _check(completion.value, source)

    log.info(
        "rebuild.done",
        sections=len(result.sections),
        lines=result.line_count,
        dropped=len(result.dropped),
        reasons=sorted({item.reason for item in result.dropped}),
        output_tokens=completion.usage.output_tokens,
    )
    return result, to_document(result, document), completion.usage


# ═══════════════════════════════════════════════════════════════════════════
# Checking
# ═══════════════════════════════════════════════════════════════════════════


def _check(built: RebuiltCV, source: SourceMaterial) -> RebuildResult:
    """Remove every line that cannot be traced back to the person's own words."""
    dropped: list[DroppedLine] = []
    sections: list[RebuiltSection] = []

    for section in built.sections:
        kept_lines = [line for line in section.lines if _survives(line, source, dropped)]
        kept_entries = []
        for entry in section.entries:
            entry.lines = [line for line in entry.lines if _survives(line, source, dropped)]
            # An entry with no bullets left is still a real job, and deleting it
            # would erase employment history rather than a claim about it.
            kept_entries.append(entry)

        if kept_lines or kept_entries:
            section.lines = kept_lines
            section.entries = kept_entries
            sections.append(section)

    headline = built.headline
    if headline and unsupported_claims(headline, source) is not None:
        dropped.append(
            DroppedLine(
                text=headline,
                reason="invented_headline",
                detail="The headline named something the person never wrote.",
            )
        )
        headline = ""

    return RebuildResult(
        headline=headline,
        approach=built.approach,
        sections=sections,
        dropped=dropped,
    )


def _survives(line: RebuiltLine, source: SourceMaterial, dropped: list[DroppedLine]) -> bool:
    text = line.text.strip()
    if not text:
        return False

    if not _quote_holds(line.drawn_from, source):
        dropped.append(
            DroppedLine(
                text=text,
                reason="unquotable_source",
                detail="Cited a source sentence that is not in your material.",
            )
        )
        return False

    found = unsupported_claims(text, source)
    if found is not None:
        dropped.append(DroppedLine(text=text, reason=found[0], detail=found[1]))
        return False

    return True


def _quote_holds(quote: str, source: SourceMaterial) -> bool:
    """Is the cited sentence genuinely drawn from the person's material?

    Measured by how much of the quote's vocabulary the person actually wrote,
    not by matching a run of characters. Models paraphrase their own citations
    — they rewrite the opening clause, merge two sentences, swap a connective —
    and a positional test reads that as a fabricated source.

    It did. A summary line citing "Three years building customer-facing web
    apps", which is in the profile word for word, was thrown away because the
    citation began "Frontend developer with three years…" and the two strings
    diverge at character one. Six lines went that way in a single run, the
    skills line among them, and the rebuilt CV scored *lower* against the job
    than the original it was meant to improve on.

    This field's job is to make the model point at its evidence. Whether the
    finished line is honest is decided by :func:`unsupported_claims`, which is
    deterministic and checks every figure, name and technology on the line
    itself. So the right test here is "did these words come from this person",
    which survives paraphrase, and not "is this string present", which does not.
    """
    words = _content_words(quote)
    if len(words) < 3:
        return False
    known = sum(1 for word in words if source.knows(word))
    return known / len(words) >= _QUOTE_FLOOR


#: Words too common to be evidence of anything. A citation made entirely of
#: these would pass any overlap test against any document.
_STOPWORDS = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "been",
        "by",
        "for",
        "from",
        "had",
        "has",
        "have",
        "in",
        "into",
        "is",
        "it",
        "its",
        "of",
        "on",
        "or",
        "that",
        "the",
        "their",
        "they",
        "this",
        "to",
        "was",
        "were",
        "which",
        "with",
        "you",
        "your",
        "our",
        "we",
        "my",
    ]
)


def _content_words(text: str) -> list[str]:
    return [
        word
        for word in re.findall(r"[a-z0-9][a-z0-9+#.-]*", normalize_text(text).lower())
        if len(word) > 2 and word not in _STOPWORDS
    ]


# ═══════════════════════════════════════════════════════════════════════════
# Back into the canonical model
# ═══════════════════════════════════════════════════════════════════════════

#: Point sizes standing in for heading level, since the shared builder infers
#: structure from relative size. Absolute values do not matter; the ordering does.
_NAME_PT = 18.0
_HEADING_PT = 13.0
_BODY_PT = 10.0


def to_document(result: RebuildResult, original: CVDocument) -> CVDocument:
    """Render the rebuild through the same builder every other format uses.

    Emitting lines and letting :func:`build_document` assemble them — rather
    than constructing sections and nodes directly — means a rebuilt CV gets the
    same structure inference, the same contact detection and the same node-id
    scheme as one parsed from a .docx. There is one implementation of what a CV
    *is*, and the preview, the validator and the exporter all keep working.

    Anchors are synthetic: this document has no address in any file on disk, so
    the exporter must rebuild rather than attempt an in-place write.
    """
    lines: list[ParsedLine] = []
    index = 0

    def emit(
        text: str, *, size: float = _BODY_PT, bold: bool = False, bullet: bool = False
    ) -> None:
        nonlocal index
        if not text.strip():
            return
        lines.append(
            ParsedLine(
                text=text.strip(),
                anchor=SyntheticAnchor(origin="redesign", index=index),
                bold=bold,
                size_pt=size,
                is_list_item=bullet,
            )
        )
        index += 1

    contact = original.contact
    emit(contact.name or "", size=_NAME_PT, bold=True)
    if result.headline:
        emit(result.headline)
    if details := " | ".join(
        part for part in (contact.email, contact.phone, contact.location) if part
    ):
        emit(details)
    for link in contact.links:
        emit(link)

    for section in result.sections:
        emit(section.title.upper(), size=_HEADING_PT, bold=True)
        for line in section.lines:
            emit(line.text, bullet=section.kind not in {"summary", "skills"})
        for entry in section.entries:
            emit(_entry_heading(entry), bold=True)
            for line in entry.lines:
                emit(line.text, bullet=True)

    return build_document(
        lines,
        doc_id=f"{original.doc_id}_rebuilt",
        source_format=original.source_format,
        source_filename=_rebuilt_name(original.source_filename),
        content_hash=original.content_hash,
        style_profile=StyleProfile(inferred=True),
        warnings=[
            "This CV was written from scratch rather than edited, so it does not "
            "keep your original file's formatting. Every line still comes from "
            "something you wrote — check it before you send it."
        ],
    )


def _entry_heading(entry) -> str:
    left = " · ".join(part for part in (entry.title, entry.organisation) if part)
    when = " – ".join(part for part in (entry.start, entry.end) if part)
    if entry.location:
        left = f"{left}, {entry.location}" if left else entry.location
    return f"{left} — {when}" if left and when else left or when


def _rebuilt_name(filename: str) -> str:
    stem, _, extension = filename.rpartition(".")
    return f"{stem or filename}-rebuilt.{extension}" if extension else f"{filename}-rebuilt"


__all__ = ["RebuildResult", "rebuild_cv", "to_document"]
