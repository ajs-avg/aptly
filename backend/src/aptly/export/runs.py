"""Run-level text surgery for Word documents.

Word stores a paragraph as a sequence of ``<w:r>`` runs, and splits them at
every formatting or spell-check boundary. A single sentence the author typed in
one go can be four runs, and each run carries its own bold, size, colour and
font. Assigning to ``paragraph.text`` destroys all of it.

So instead of replacing a paragraph, we replace *a span inside it*, and we make
the edit as small as possible: the shared opening and closing text is left
alone, and only the genuinely changed middle is rewritten. Change one word in a
bullet and exactly one run is touched — every other run keeps its formatting
because it was never written to.
"""

from __future__ import annotations

from dataclasses import dataclass

from docx.text.paragraph import Paragraph


@dataclass(frozen=True, slots=True)
class _Span:
    """Where a run sits in the paragraph's concatenated text."""

    index: int
    start: int
    end: int  # exclusive


def replace_span(paragraph: Paragraph, start: int, end: int, replacement: str) -> bool:
    """Replace ``paragraph.text[start:end]`` with ``replacement``.

    Returns True when the document was modified. Formatting is preserved by
    writing to the fewest runs that can carry the change.
    """
    runs = paragraph.runs
    if not runs:
        return False

    current = "".join(run.text for run in runs)
    if not 0 <= start <= end <= len(current):
        return False
    if current[start:end] == replacement:
        return False

    # Narrow the edit to what actually differs. Everything the old and new text
    # share at each end stays in whichever run already holds it.
    old_middle = current[start:end]
    lead = _common_prefix(old_middle, replacement)
    tail = _common_suffix(old_middle[lead:], replacement[lead:])
    start += lead
    end -= tail
    replacement = replacement[lead : len(replacement) - tail]

    spans = _run_spans(runs)
    touched = [s for s in spans if s.start < end and s.end > start] or _fallback(spans, start)
    if not touched:
        return False

    first = touched[0]
    head = runs[first.index].text[: max(0, start - first.start)]

    last = touched[-1]
    tail_offset = end - last.start
    rest = runs[last.index].text[tail_offset:] if tail_offset < len(runs[last.index].text) else ""

    # The whole replacement lands in the first touched run, which is the one
    # whose formatting the reader associates with the start of the edit.
    runs[first.index].text = head + replacement + (rest if first is last else "")
    for span in touched[1:-1]:
        runs[span.index].text = ""
    if last is not first:
        runs[last.index].text = rest

    return True


def replace_paragraph(paragraph: Paragraph, start: int, end: int, replacement: str) -> bool:
    """``replace_span``, but tolerant of a paragraph whose text has drifted.

    If the recorded span no longer lines up — the user edited the file in Word
    between uploading and exporting — fall back to replacing the whole stripped
    body of the paragraph, which is still better than doing nothing.
    """
    if replace_span(paragraph, start, end, replacement):
        return True

    current = "".join(run.text for run in paragraph.runs)
    lead = len(current) - len(current.lstrip())
    trail = len(current.rstrip())
    if (lead, trail) == (start, end):
        return False
    return replace_span(paragraph, lead, trail, replacement)


# ── internals ───────────────────────────────────────────────────────────────


def _run_spans(runs: list) -> list[_Span]:
    spans: list[_Span] = []
    cursor = 0
    for index, run in enumerate(runs):
        length = len(run.text)
        spans.append(_Span(index=index, start=cursor, end=cursor + length))
        cursor += length
    return spans


def _fallback(spans: list[_Span], start: int) -> list[_Span]:
    """The run to use for a pure insertion, which overlaps nothing."""
    for span in spans:
        if span.start <= start <= span.end:
            return [span]
    return spans[-1:] if spans else []


def _common_prefix(a: str, b: str) -> int:
    limit = min(len(a), len(b))
    i = 0
    while i < limit and a[i] == b[i]:
        i += 1
    return i


def _common_suffix(a: str, b: str) -> int:
    limit = min(len(a), len(b))
    i = 0
    while i < limit and a[len(a) - 1 - i] == b[len(b) - 1 - i]:
        i += 1
    return i
