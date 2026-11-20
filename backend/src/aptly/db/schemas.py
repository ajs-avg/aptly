"""API shapes for saved records.

Separate from the SQLAlchemy models on purpose: the wire format is a contract
with the browser and should not shift every time a column is added.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from aptly.llm.schemas import JobPost

RecordStatus = Literal[
    "saved", "applied", "screening", "interviewing", "offer", "rejected", "withdrawn"
]

#: What the UI offers, in the order a search actually moves through.
STATUSES: tuple[RecordStatus, ...] = (
    "saved",
    "applied",
    "screening",
    "interviewing",
    "offer",
    "rejected",
    "withdrawn",
)


class FrozenSnapshot(BaseModel):
    """The job post, kept exactly as it was on the day.

    Written once and never refreshed. Postings come down within weeks of being
    filled, and the whole promise of the Library is that the person still has
    the wording they applied against when a recruiter finally calls.

    Both halves are stored deliberately. ``raw`` is the evidence — what they
    actually read and applied to. ``parsed`` is the distillation, so opening a
    Recruiter-Ready Card weeks later costs nothing and does not depend on a
    model still being available to re-read the advert.
    """

    raw: str = Field(description="The advert exactly as submitted.")
    parsed: JobPost | None = Field(
        default=None, description="Requirements and keywords, as read at capture time."
    )
    content_hash: str = Field(description="SHA-256 of the raw text.")
    captured_at: datetime
    source_url: str | None = None
    #: The match score at the moment of saving — part of "as it was on the
    #: day" exactly like the advert's wording. Lives here rather than as a
    #: column because this table has no migration story yet, and a JSON field
    #: absorbs a new key where a schema will not.
    score: int | None = Field(default=None, ge=0, le=100)

    @classmethod
    def capture(
        cls,
        raw: str,
        *,
        parsed: JobPost | None = None,
        source_url: str | None = None,
        score: int | None = None,
    ) -> FrozenSnapshot:
        return cls(
            raw=raw,
            parsed=parsed,
            content_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            captured_at=datetime.now(UTC),
            source_url=source_url,
            score=score,
        )

    @property
    def word_count(self) -> int:
        return len(self.raw.split())


class CvVersionSummary(BaseModel):
    """A CV version as the Library lists it."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    source_format: str
    content_hash: str
    created_at: datetime
    change_count: int = 0
    #: ``tailored``, ``rebuilt`` or ``uploaded``. Null on versions saved before
    #: the field existed.
    variant: str | None = None
    #: Whether this is the one that went to the employer. Null means nobody has
    #: said, which is a different thing from "no".
    sent: bool | None = None
    #: The parsed document itself, so the Library can show the CV that was
    #: sent rather than only naming it. Served on the detail view — a record
    #: has a version or two, not a feed of them.
    doc_model: dict = Field(default_factory=dict)


class ShapeLine(BaseModel):
    """One line of a CV, as a thumbnail needs to draw it.

    Width as a percentage of the column and a one-letter kind, which is
    everything a silhouette needs and a fraction of what the document weighs.
    The Library lists dozens of records; shipping every ``doc_model`` to draw
    forty postage stamps would be megabytes for a picture.
    """

    w: int = Field(ge=0, le=100)
    #: ``n`` name, ``c`` contact, ``h`` heading, ``r`` role, ``b`` body.
    k: Literal["n", "c", "h", "r", "b"]


class RecordSummary(BaseModel):
    """One row in the Library."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company: str | None
    role: str | None
    location: str | None
    status: RecordStatus
    applied_at: datetime | None
    created_at: datetime
    updated_at: datetime
    cv_count: int = 0
    keywords: list[str] = Field(default_factory=list)
    #: The match score at the moment of saving, surfaced on the list so the
    #: Library can notice which scores actually got calls.
    score: int | None = None
    #: Which document went to the employer, where it is known.
    sent_variant: str | None = None
    #: Which variants this record holds at all, so the list can say "2 CVs"
    #: and name them without fetching either.
    variants: list[str] = Field(default_factory=list)
    #: The shape of the CV that was sent, for the thumbnail on the card.
    cv_shape: list[ShapeLine] = Field(default_factory=list)


class RecordDetail(RecordSummary):
    """A record, opened."""

    notes: str | None = None
    source_url: str | None = None
    salary_text: str | None = None
    snapshot: FrozenSnapshot | None = None
    cv_versions: list[CvVersionSummary] = Field(default_factory=list)


class SaveRecordRequest(BaseModel):
    """Save an application: the advert, and the CV that was sent for it."""

    job_text: str = Field(min_length=20, max_length=60_000)
    job: JobPost | None = Field(
        default=None, description="The parsed advert, if the tailoring run already produced one."
    )
    source_url: str | None = None

    filename: str = Field(default="cv.txt", max_length=500)
    source_format: str = Field(default="txt")
    content_hash: str = Field(default="", max_length=64)
    doc_model: dict = Field(default_factory=dict)
    change_log: list[dict] = Field(default_factory=list)
    #: What the document scored when it was approved, kept with the snapshot.
    score: int | None = Field(default=None, ge=0, le=100)

    status: RecordStatus = "saved"
    notes: str | None = None

    #: Attach this CV to an application already in the Library instead of
    #: opening a second one for the same job. The client sends it after asking
    #: the person which of the two documents they actually sent.
    record_id: UUID | None = None
    #: Which of the run's documents this is.
    variant: Literal["tailored", "rebuilt", "uploaded"] | None = None
    #: True when this is the one that went to the employer. Setting it clears
    #: the flag on every other version of the same record.
    sent: bool | None = None


class RecordMatch(BaseModel):
    """An application already in the Library that this save would duplicate.

    ``exact`` separates the two cases the client has to word differently: the
    same advert text, where there is nothing to ask beyond which CV was sent,
    and the same company and role with different wording, where the person has
    to confirm it is even the same job.
    """

    record: RecordDetail
    exact: bool


class UpdateRecordRequest(BaseModel):
    """Everything the Library lets you edit after the fact."""

    status: RecordStatus | None = None
    notes: str | None = None
    applied_at: datetime | None = None
    company: str | None = None
    role: str | None = None
