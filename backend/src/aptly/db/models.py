"""The database schema.

Deliberately portable. Every column type here behaves the same on SQLite and on
Postgres, so the app runs from a local file today and against Supabase the
moment there is a URL for it — no second schema, no migration rewrite.

That rules out a few Postgres luxuries, and the trade is worth naming:

* **No native arrays.** Lists are JSON columns. Slightly clumsier to query, but
  the alternative is a schema that only exists on one engine.
* **No row-level security.** Tenancy is enforced in :mod:`aptly.db.repository`,
  where every query filters by owner. RLS is a valuable second line of defence
  and should be added on Supabase, but it cannot be the *only* line while
  SQLite is also supported.
* **UUID primary keys**, via SQLAlchemy's dialect-aware ``Uuid`` type. Ids that
  are generated client-side and never collide matter more here than the few
  bytes an integer would save.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _now() -> datetime:
    return datetime.now(UTC)


def _new_id() -> uuid.UUID:
    return uuid.uuid4()


class Base(DeclarativeBase):
    """Shared declarative base.

    ``JSON`` maps to ``jsonb`` on Postgres and to a text column on SQLite, which
    is exactly the portability we want without naming either dialect.
    """

    # Declared by SQLAlchemy's declarative API, not a mutable default that
    # instances could share.
    type_annotation_map: ClassVar[dict] = {
        dict[str, Any]: JSON,
        list[str]: JSON,
        list[dict[str, Any]]: JSON,
    }


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )


# ═══════════════════════════════════════════════════════════════════════════
# Identity
# ═══════════════════════════════════════════════════════════════════════════


class Profile(Base, TimestampMixin):
    """A person using Aptly.

    Kept separate from whatever authenticates them. Supabase Auth owns users in
    its own schema, and the local development sign-in owns nothing at all, so
    ``auth_subject`` is simply whatever the current provider calls this person.
    Swapping providers then means backfilling one column rather than migrating
    every foreign key in the database.
    """

    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_id)
    #: Stable id from the auth provider — a Supabase user id, or an email in dev.
    auth_subject: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    display_name: Mapped[str | None] = mapped_column(String(200))
    #: scrypt, salted, with its cost written into the string. See
    #: :mod:`aptly.auth.passwords`.
    #:
    #: Nullable, and it has to be: a profile authenticated by Supabase has no
    #: password here and never will, because Supabase holds it. Null means "this
    #: person does not sign in with a password", not "any password will do" —
    #: `verify` returns False for it either way.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    target_roles: Mapped[list[str]] = mapped_column(default=list)
    preferences: Mapped[dict[str, Any]] = mapped_column(default=dict)

    #: The career profile — everything the person has told us about their own
    #: history. Stored as one JSON document rather than a dozen tables because
    #: it is read and written whole, it is never queried by field, and it is the
    #: user's own material rather than relational data we reason over.
    #:
    #: It is also what makes a freely-rebuilt CV honest: the no-fabrication
    #: checker pools this with the uploaded CV, so a fuller profile widens the
    #: evidence base without loosening the rule.
    career_profile: Mapped[dict[str, Any]] = mapped_column(default=dict)

    job_records: Mapped[list[JobRecord]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    cv_versions: Mapped[list[CvVersion]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class AnonSession(Base, TimestampMixin):
    """Work done before signing up.

    The design doc's rule is "first win before first signup", which means a
    stranger can tailor a CV and only then be asked for an account. Their work
    is held against this id, and claiming it on signup is a single ownership
    update rather than a data migration — nothing moves, so nothing is lost.
    """

    __tablename__ = "anon_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_id)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    claimed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def is_claimed(self) -> bool:
        return self.claimed_by is not None


# ═══════════════════════════════════════════════════════════════════════════
# The living record
# ═══════════════════════════════════════════════════════════════════════════


class JobRecord(Base, TimestampMixin):
    """One application: the job, and what was sent for it.

    The frozen snapshot is the point of the whole table. Postings are taken down
    within weeks of being filled, and the person needs the exact wording they
    applied against when a recruiter finally calls. It is written once and never
    refreshed — a snapshot that updates is not a snapshot.
    """

    __tablename__ = "job_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_id)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )

    company: Mapped[str | None] = mapped_column(String(300), index=True)
    role: Mapped[str | None] = mapped_column(String(300), index=True)
    location: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(40), default="saved", index=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_url: Mapped[str | None] = mapped_column(Text)
    salary_text: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    #: The advert exactly as submitted, plus what we parsed out of it, plus a
    #: hash and a capture time. See :class:`aptly.db.schemas.FrozenSnapshot`.
    frozen_snapshot: Mapped[dict[str, Any]] = mapped_column(default=dict)

    profile: Mapped[Profile] = relationship(back_populates="job_records")
    cv_versions: Mapped[list[CvVersion]] = relationship(
        back_populates="job_record", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # The Library lists newest first and filters by owner, every time.
        Index("ix_job_records_profile_created", "profile_id", "created_at"),
    )


class CvVersion(Base, TimestampMixin):
    """The CV as it was for one application.

    ``content_hash`` answers the question the product exists for — "which CV did
    I send?" — with certainty rather than a guess, months after the fact.
    """

    __tablename__ = "cv_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_new_id)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )
    job_record_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("job_records.id", ondelete="CASCADE"), index=True
    )
    #: The previous version this was edited from, so history is a chain.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cv_versions.id", ondelete="SET NULL")
    )

    filename: Mapped[str] = mapped_column(String(500))
    source_format: Mapped[str] = mapped_column(String(10))
    #: SHA-256 of the original bytes.
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    #: Where the bytes live, once there is object storage. Null while the
    #: browser is the only holder of the file.
    blob_id: Mapped[str | None] = mapped_column(String(500))

    #: The parsed CVDocument, so a record can be reopened and re-tailored
    #: without the original file.
    doc_model: Mapped[dict[str, Any]] = mapped_column(default=dict)
    #: One entry per applied suggestion: node id, before, after, reason.
    change_log: Mapped[list[dict[str, Any]]] = mapped_column(default=list)

    profile: Mapped[Profile] = relationship(back_populates="cv_versions")
    job_record: Mapped[JobRecord] = relationship(back_populates="cv_versions")


# ═══════════════════════════════════════════════════════════════════════════
# Operations
# ═══════════════════════════════════════════════════════════════════════════


class UsageEvent(Base):
    """What a model call cost, and who caused it.

    Recorded from the first day because the free tier lets strangers spend real
    money, and a limit you cannot measure is a wish.
    """

    __tablename__ = "usage_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    #: A profile id or an anonymous session id — whoever this is chargeable to.
    owner_key: Mapped[str] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(80))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    #: Stored in micro-dollars: integers, because floating-point money in a
    #: spend guardrail is a bug waiting for a busy afternoon.
    cost_micros: Mapped[int] = mapped_column(Integer, default=0)
    anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
