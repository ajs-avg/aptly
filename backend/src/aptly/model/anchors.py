"""Source anchors — the link back into the user's original file.

This is the heart of format preservation. Every piece of editable text in a CV
carries an anchor saying exactly where it came from, so that when the user taps
Apply we can write the change back into *their* document rather than rebuilding
it from scratch.

Each format needs a different kind of address:

- ``docx`` — Word splits a single sentence across several ``<w:r>`` runs
  (spell-check state, a bolded word, an autocorrect boundary). We record the run
  span so the exporter can rewrite text while keeping every run's formatting.
- ``tex``  — the source is plain text, so a line and character span is exact.
- ``pdf``  — a PDF has no notion of a sentence, only glyphs at coordinates. The
  anchor is therefore *descriptive, not editable*: we use it to infer style and
  reading order, never to write back. See ``export/pdf.py``.
- ``text`` — .txt and .md, where a line span says everything.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class DocxAnchor(BaseModel):
    """A character span inside one Word paragraph, mapped onto its runs."""

    kind: Literal["docx"] = "docx"
    paragraph_index: int
    char_start: int
    char_end: int
    #: Runs the span touches, as a half-open range into ``paragraph.runs``.
    run_start: int
    run_end: int
    #: Set when the paragraph lives inside a table cell (common in two-column CVs).
    table_path: tuple[int, int, int] | None = None


class TexAnchor(BaseModel):
    """A character span in the LaTeX source."""

    kind: Literal["tex"] = "tex"
    line_start: int
    line_end: int
    char_start: int
    char_end: int
    #: The enclosing macro, e.g. ``item``, ``section``, ``cventry``.
    macro: str | None = None


class PdfAnchor(BaseModel):
    """Where a line sat on the page. Descriptive only — never written back."""

    kind: Literal["pdf"] = "pdf"
    page: int
    line_index: int
    #: (x0, top, x1, bottom) in PDF points.
    bbox: tuple[float, float, float, float]
    column: int = 0


class TextAnchor(BaseModel):
    """A character span in a plain-text or Markdown source."""

    kind: Literal["text"] = "text"
    line_start: int
    line_end: int
    char_start: int
    char_end: int


class SyntheticAnchor(BaseModel):
    """Text with no address in any source file.

    Two things produce it, and both are cases where an in-place edit is not a
    conservative choice but a wrong one:

    - **Vision.** A CV read from pixels never had a character span to return to.
      There is no run to rewrite, no line number to patch.
    - **Redesign.** Once a bullet has been moved under a different heading, its
      old anchor points at where it *used to* live. Writing through it would put
      the new text back in the old place.

    Carrying that as a distinct anchor kind means the exporter can detect it
    structurally instead of inferring it, and tell the user plainly that this
    document has to be rebuilt.
    """

    kind: Literal["synthetic"] = "synthetic"
    origin: Literal["vision", "redesign"]
    #: Reading order at the time it was created. Purely for stable sorting.
    index: int = 0
    page: int | None = None


SourceAnchor = Annotated[
    DocxAnchor | TexAnchor | PdfAnchor | TextAnchor | SyntheticAnchor,
    Field(discriminator="kind"),
]


def is_writable(anchor: SourceAnchor) -> bool:
    """Can we edit the original file in place through this anchor?

    False for PDF, which is a print format: text has no reflow, so replacing a
    line with a longer one would overlap or clip. False for synthetic anchors,
    which by definition never addressed a source file. Both are rebuilt from the
    inferred style profile instead.
    """
    return anchor.kind not in {"pdf", "synthetic"}
