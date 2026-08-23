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

    @classmethod
    def capture(
        cls, raw: str, *, parsed: JobPost | None = None, source_url: str | None = None
    ) -> FrozenSnapshot:
        return cls(
            raw=raw,
            parsed=parsed,
            content_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            captured_at=datetime.now(UTC),
            source_url=source_url,
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

    status: RecordStatus = "saved"
    notes: str | None = None


class UpdateRecordRequest(BaseModel):
    """Everything the Library lets you edit after the fact."""

    status: RecordStatus | None = None
    notes: str | None = None
    applied_at: datetime | None = None
    company: str | None = None
    role: str | None = None
