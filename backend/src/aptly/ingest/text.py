"""Plain text and Markdown parser.

The easy case, and the reference implementation: a line is a line, so anchors
are exact and export is a byte-for-byte rewrite of the lines we changed.
"""

from __future__ import annotations

import re

from aptly.ingest.builder import ParsedLine, build_document
from aptly.ingest.sections import (
    BULLET_PREFIX,
    DATE_RANGE,
    classify_heading,
    is_bullet,
    is_contact_line,
    starts_with_label,
)
from aptly.model.anchors import TextAnchor
from aptly.model.document import CVDocument
from aptly.model.style import FontSpec, StyleProfile

#: ``## Experience`` / ``**Experience**`` / ``Experience\n----------``
_MD_ATX = re.compile(r"^(#{1,6})\s+(.*)$")
_MD_BOLD_ONLY = re.compile(r"^\s*\*\*(.+?)\*\*\s*$")
_MD_SETEXT = re.compile(r"^\s*(=|-){3,}\s*$")


def parse_text(
    raw: str,
    *,
    doc_id: str,
    source_filename: str,
    content_hash: str,
    is_markdown: bool = False,
) -> CVDocument:
    """Parse a .txt or .md CV."""
    raw_lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    parsed: list[ParsedLine] = []
    prev_blank = False

    for i, raw_line in enumerate(raw_lines):
        stripped = raw_line.strip()
        if not stripped:
            prev_blank = True
            continue

        # A setext underline styles the line above; it is not content itself.
        if is_markdown and _MD_SETEXT.match(raw_line):
            if parsed:
                parsed[-1].bold = True
                parsed[-1].size_pt = 13.0
            continue

        text, bold, size = stripped, False, None
        if is_markdown:
            text, bold, size = _strip_markdown(stripped)

        indent = len(raw_line) - len(raw_line.lstrip())
        # The anchor starts *after* any bullet glyph. The node's text has the
        # glyph stripped, so if the anchor covered it too, exporting would
        # replace "- Built the thing" with "Built the rewritten thing" and
        # silently delete the bullet from the person's CV.
        bullet_width = _bullet_width(stripped)
        content_start = indent + bullet_width

        line = ParsedLine(
            text=text,
            anchor=TextAnchor(
                line_start=i,
                line_end=i,
                char_start=content_start,
                char_end=len(raw_line.rstrip()),
            ),
            bold=bold,
            size_pt=size,
            is_list_item=bullet_width > 0,
            gap_before=prev_blank,
        )

        # A bullet that wraps onto the next line is one sentence, not two. Left
        # split, the model is handed "…and performed model" as a whole thought
        # and rewrites half a sentence — which is both useless and impossible to
        # apply cleanly.
        if _continues(parsed[-1] if parsed else None, line, indent, prev_blank):
            _absorb(parsed[-1], line)
        else:
            parsed.append(line)
        prev_blank = False

    return build_document(
        parsed,
        doc_id=doc_id,
        source_format="md" if is_markdown else "txt",
        source_filename=source_filename,
        content_hash=content_hash,
        style_profile=_default_profile(),
    )


#: A line ending in one of these has finished its thought.
#:
#: Only full stops and their emphatic cousins qualify. A comma, colon or
#: semicolon means the opposite — the sentence is mid-flight — so treating them
#: as terminal stopped wrapped bullets from rejoining at exactly the point where
#: the evidence for joining was strongest.
_TERMINAL = (".", "!", "?")

#: At equal indentation, only a line long enough to have *hit the margin* can be
#: something that wrapped. Without this, a name followed by a job title — two
#: short, unpunctuated lines at column zero — reads as one wrapped sentence and
#: the person's name becomes "Elena Volkov Growth Marketing Manager".
_PLAUSIBLE_WRAP_WIDTH = 55


def _continues(
    previous: ParsedLine | None, line: ParsedLine, indent: int, blank_before: bool
) -> bool:
    """Is ``line`` the wrapped remainder of ``previous``?

    Two signals, either of which is enough on its own:

    * the line is **indented past** the one above it, which is how every text CV
      marks a continuation; or
    * the line above **stopped mid-sentence**, with no closing punctuation.

    Neither applies across a blank line, to a new bullet, or to a heading —
    those genuinely start something new.
    """
    if previous is None or blank_before:
        return False
    if previous.anchor.kind != "text" or line.anchor.kind != "text":
        return False
    if is_bullet(line.text) or line.is_list_item:
        return False
    # A new labelled item ('Core CS: …') is never a continuation.
    if starts_with_label(line.text):
        return False
    if classify_heading(line.text) is not None or classify_heading(previous.text) is not None:
        return False
    # A heading-shaped line (short, bold, all caps) is never a continuation.
    if line.bold or previous.bold:
        return False

    # Contact rows sit flush and unpunctuated next to each other; joining them
    # produces one unusable blob.
    if is_contact_line(line.text) or is_contact_line(previous.text):
        return False
    # "Product Manager, Acme — Mar 2022 – Present" opens an entry, and would
    # otherwise swallow the first bullet underneath it.
    #
    # Keyed on the *date range* alone, not on the looser comma heuristic that
    # also identifies entry headings elsewhere. That heuristic accepts any short
    # comma-joined line, which describes the opening line of almost every
    # professional summary ever written — and blocking the merge there left the
    # summary as a pile of half-sentences.
    if DATE_RANGE.search(previous.text):
        return False

    content_start = previous.anchor.char_start

    # A hanging indent is the clearest signal there is. Under a bullet, every
    # continuation line aligns with the bullet's *text*, while a new item starts
    # back at the glyph. That holds across sentence boundaries, which is why it
    # is checked before punctuation: a long bullet routinely contains several
    # full stops and none of them ends the bullet.
    if previous.is_list_item and indent == content_start:
        return True

    if indent > content_start:
        return True
    return (
        indent == content_start
        and len(previous.text) >= _PLAUSIBLE_WRAP_WIDTH
        and not previous.text.rstrip().endswith(_TERMINAL)
    )


def _bullet_width(stripped: str) -> int:
    """Length of the leading bullet glyph and its trailing space, if any."""
    match = BULLET_PREFIX.match(stripped)
    return match.end() if match else 0


def _absorb(previous: ParsedLine, line: ParsedLine) -> None:
    """Fold a continuation into the line above, widening its anchor to match."""
    previous.text = f"{previous.text} {line.text}".strip()
    previous.anchor = TextAnchor(
        line_start=previous.anchor.line_start,
        line_end=line.anchor.line_end,
        char_start=previous.anchor.char_start,
        char_end=line.anchor.char_end,
    )


def _strip_markdown(line: str) -> tuple[str, bool, float | None]:
    """Return (text, bold, size_pt) with Markdown syntax removed.

    Heading level becomes a size so the shared builder can treat a Markdown
    heading exactly like a large bold line in a Word document.
    """
    if m := _MD_ATX.match(line):
        level = len(m.group(1))
        return m.group(2).strip(), True, max(11.0, 20.0 - 2.0 * level)
    if m := _MD_BOLD_ONLY.match(line):
        return m.group(1).strip(), True, None

    text = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\((.+?)\)", r"\1 (\2)", text)
    return text.strip(), False, None


def _default_profile() -> StyleProfile:
    """A clean, ATS-safe default for sources that carry no styling of their own."""
    return StyleProfile(
        body=FontSpec(family="Helvetica", size_pt=10.5),
        name=FontSpec(family="Helvetica", size_pt=20.0, bold=True),
        section_heading=FontSpec(family="Helvetica", size_pt=12.0, bold=True),
        entry_heading=FontSpec(family="Helvetica", size_pt=11.0, bold=True),
        heading_transform="upper",
        heading_rule=True,
    )
