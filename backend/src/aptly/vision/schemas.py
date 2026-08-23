"""What the vision pass is allowed to return.

The schema is the safety mechanism, exactly as it is for tailoring. This model
is being handed a document and asked to transcribe it, and the one thing it must
not do is improve the writing on the way through — a "tidied" bullet is a
fabrication that arrives *before* the no-fabrication validator can see it,
because at that point there is no original to compare against.

So the schema offers nowhere to put an improvement. There is no summary field,
no rating, no suggestion. Every string is a line of the page, and the prompt
says verbatim. What the model is allowed to editorialise about is confined to
:attr:`VisionRead.notes` and :attr:`VisionRead.fully_legible`, both of which are
about the *scan*, not about the person.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class VisionLine(BaseModel):
    """One line of text as it appears on the page."""

    text: str = Field(
        description=(
            "One whole logical line — a complete bullet, heading or paragraph — "
            "exactly as printed, character for character. Where it wraps across "
            "several printed lines, join the pieces with a single space. Do not "
            "correct spelling, expand abbreviations, reword, or merge two "
            "separate items into one."
        )
    )
    page: int = Field(default=0, description="Zero-based page this line appears on.")
    heading_level: int = Field(
        default=0,
        description=(
            "0 for ordinary text, 1 for the person's name at the top of the CV, "
            "2 for a section heading such as EXPERIENCE or EDUCATION."
        ),
    )
    bold: bool = Field(default=False, description="True if the line is printed in bold.")
    bullet: bool = Field(
        default=False,
        description=(
            "True if this line is a bullet point. Give the text WITHOUT the bullet "
            "character itself."
        ),
    )


class VisionRead(BaseModel):
    """A whole CV, transcribed from its pages."""

    lines: list[VisionLine] = Field(
        default_factory=list,
        description=(
            "Every logical line of the CV in reading order. For a two-column "
            "layout, read the full left column first, then the full right column."
        ),
    )
    pages: int = Field(default=1, description="How many pages the document has.")
    fully_legible: bool = Field(
        default=True,
        description=(
            "False if any part of the document was blurred, cut off, or otherwise "
            "impossible to read with confidence."
        ),
    )
    notes: list[str] = Field(
        default_factory=list,
        description=(
            "Problems with the scan itself that the person should know about — a "
            "cropped edge, a rotated page. Never comments about the CV's content "
            "or quality."
        ),
    )
