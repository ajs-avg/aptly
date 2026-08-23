"""What a freely-rebuilt CV is allowed to be.

This is the second of the two documents a run produces, and it is the one with
real latitude: it does not edit the uploaded CV, it composes a new one from
everything the person has told us — their CV, their profile, their Story Bank.
It chooses the sections, their order, what goes in them and how each line reads.

That freedom is bounded in exactly one way, and it is the same bound as
everywhere else: **it may only say things the person said first.** The
difference from the tailoring path is where the boundary sits, not whether there
is one. Tailoring is bounded by *the line it is editing*; a rebuild is bounded by
*the whole body of what the person has written*.

So every composed line carries a ``drawn_from`` quote, and every composed line is
run through the same figure/name/technology check the tailoring validator uses —
see :func:`aptly.validate.unsupported_claims`. A rebuild has more room to invent
than an edit does, not less, which is why it gets the identical test rather than
a gentler one.

The schema is deliberately shallow. A model asked for deeply nested structure
spends its attention on the shape and not on the writing, and a CV is not a
complicated document: a header, some sections, some entries, some lines.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RebuiltSectionKind = Literal[
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "publications",
    "awards",
    "volunteering",
    "languages",
    "interests",
    "custom",
]


class RebuiltLine(BaseModel):
    """One composed line, and the thing the person wrote that supports it."""

    text: str = Field(description="The line as it should appear on the CV.")
    drawn_from: str = Field(
        default="",
        description=(
            "The sentence from their CV, profile or Story Bank that this is based "
            "on, quoted. Not a paraphrase — the words they actually wrote. A line "
            "you cannot quote a source for is one you must not write."
        ),
    )


class RebuiltEntry(BaseModel):
    """One job, project, degree or award."""

    title: str = Field(default="", description="Job title, project name or degree.")
    organisation: str = Field(default="", description="Employer, client or institution.")
    location: str = ""
    start: str = ""
    end: str = Field(default="", description="Empty or 'Present' for a current role.")
    lines: list[RebuiltLine] = Field(
        default_factory=list, description="The bullets under this entry."
    )


class RebuiltSection(BaseModel):
    """One block of the CV."""

    kind: RebuiltSectionKind
    title: str = Field(description="The heading as it should be printed.")
    #: Loose lines under the heading — a summary paragraph, a skills line.
    lines: list[RebuiltLine] = Field(default_factory=list)
    entries: list[RebuiltEntry] = Field(default_factory=list)


class RebuiltCV(BaseModel):
    """A complete CV, composed for one job."""

    headline: str = Field(
        default="",
        description=(
            "The line under their name, e.g. 'Frontend Developer'. It must be "
            "something they already call themselves — this is an identity claim, "
            "and it is the first thing an interview tests."
        ),
    )
    sections: list[RebuiltSection] = Field(
        default_factory=list,
        description="The whole CV in reading order. You choose which and in what order.",
    )
    approach: str = Field(
        default="",
        description=(
            "One or two sentences on the case this document makes and why it is "
            "ordered this way. Shown to the person so they can disagree with it."
        ),
    )


# ═══════════════════════════════════════════════════════════════════════════
# What came back after checking
# ═══════════════════════════════════════════════════════════════════════════


class DroppedLine(BaseModel):
    """A composed line that did not survive checking. Counted, never hidden."""

    text: str
    reason: str
    detail: str = ""


class RebuildResult(BaseModel):
    """The rebuilt CV, and an honest account of what was thrown away making it."""

    headline: str = ""
    approach: str = ""
    sections: list[RebuiltSection] = Field(default_factory=list)
    dropped: list[DroppedLine] = Field(default_factory=list)

    @property
    def line_count(self) -> int:
        return sum(
            len(section.lines) + sum(len(entry.lines) for entry in section.entries)
            for section in self.sections
        )


__all__ = [
    "DroppedLine",
    "RebuildResult",
    "RebuiltCV",
    "RebuiltEntry",
    "RebuiltLine",
    "RebuiltSection",
    "RebuiltSectionKind",
]
