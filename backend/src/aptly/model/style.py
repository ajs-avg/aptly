"""Style profile — the visual identity of the user's CV.

For .docx and .tex we edit the original file, so this is only used for preview
and for the human-skim score. For .pdf it does the heavy lifting: a PDF cannot
be edited in place, so we infer how the document *looks* and rebuild a close
match. Everything here is therefore measurable from the source, never invented.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

HeadingTransform = Literal["none", "upper", "title"]


class FontSpec(BaseModel):
    """A resolved text appearance, as measured from the source document."""

    family: str = "Helvetica"
    size_pt: float = 10.5
    bold: bool = False
    italic: bool = False
    color: str = "#16181D"
    letter_spacing_pt: float = 0.0

    @property
    def css_family(self) -> str:
        """Family name with a sane web fallback stack for the rebuild path."""
        generic = "serif" if _looks_serif(self.family) else "sans-serif"
        return f'"{self.family}", {generic}'


class Margins(BaseModel):
    top_pt: float = 54.0
    right_pt: float = 54.0
    bottom_pt: float = 54.0
    left_pt: float = 54.0


class StyleProfile(BaseModel):
    """How this CV presents itself.

    Populated by the parsers; consumed by the exporters and the skim scorer.
    """

    # ── page ─────────────────────────────────────────────────────────────
    page_width_pt: float = 595.28  # A4
    page_height_pt: float = 841.89
    margins: Margins = Field(default_factory=Margins)
    columns: int = 1

    # ── type ─────────────────────────────────────────────────────────────
    body: FontSpec = Field(default_factory=FontSpec)
    name: FontSpec = Field(default_factory=lambda: FontSpec(size_pt=20.0, bold=True))
    section_heading: FontSpec = Field(default_factory=lambda: FontSpec(size_pt=12.0, bold=True))
    entry_heading: FontSpec = Field(default_factory=lambda: FontSpec(size_pt=11.0, bold=True))

    # ── section heading treatment ────────────────────────────────────────
    heading_transform: HeadingTransform = "none"
    heading_rule: bool = False  # a hairline under each section heading
    heading_space_before_pt: float = 10.0
    heading_space_after_pt: float = 4.0

    # ── body rhythm ──────────────────────────────────────────────────────
    line_spacing: float = 1.15
    paragraph_space_pt: float = 4.0
    bullet_glyph: str = "•"
    bullet_indent_pt: float = 12.0

    # ── accent ───────────────────────────────────────────────────────────
    accent_color: str | None = None

    #: True when the profile was inferred from a PDF rather than read from a
    #: structured source. Surfaced in the UI so the rebuild is never silent.
    inferred: bool = False

    def scaled(self, factor: float) -> StyleProfile:
        """A copy with every type size scaled — used to fit an edited CV back
        onto the same number of pages."""
        out = self.model_copy(deep=True)
        for spec in (out.body, out.name, out.section_heading, out.entry_heading):
            spec.size_pt = round(spec.size_pt * factor, 2)
        return out


_SERIF_HINTS = (
    "times",
    "garamond",
    "georgia",
    "cambria",
    "book",
    "serif",
    "minion",
    "palatino",
    "baskerville",
    "caslon",
    "charter",
    "utopia",
)


def _looks_serif(family: str) -> bool:
    lowered = family.lower()
    if "sans" in lowered:
        return False
    return any(hint in lowered for hint in _SERIF_HINTS)
