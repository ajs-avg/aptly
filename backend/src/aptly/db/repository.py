"""Every query the Library makes.

All of them take an owner and filter by it. That is not a convention here, it is
the tenancy model: SQLite has no row-level security, so if a query in this
module forgets its owner filter, one person sees another person's applications.
Keeping the queries in one small file is what makes that reviewable.

When this runs on Supabase, add RLS policies as a second line of defence — but
these filters stay, because they are the line that works on both engines.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import String, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aptly.db.models import AnonSession, CvVersion, JobRecord, Profile, UsageEvent
from aptly.db.schemas import (
    CvVersionSummary,
    FrozenSnapshot,
    RecordDetail,
    RecordSummary,
    SaveRecordRequest,
    UpdateRecordRequest,
)
from aptly.llm.schemas import JobPost
from aptly.logging import get_logger

log = get_logger(__name__)

#: How long unclaimed anonymous work is kept. Long enough to come back after
#: thinking it over, short enough not to hoard strangers' CVs.
ANON_SESSION_TTL = timedelta(days=7)


# ═══════════════════════════════════════════════════════════════════════════
# Profiles and sessions
# ═══════════════════════════════════════════════════════════════════════════


async def get_or_create_profile(
    session: AsyncSession,
    *,
    profile_id: UUID,
    auth_subject: str,
    email: str | None = None,
) -> Profile:
    """Find the profile behind an authenticated subject, creating it on first sight.

    ``profile_id`` comes from the auth provider and *is* the primary key — it is
    not generated here. Both providers already derive a stable id for a person
    (Supabase's user id; a hash of the email in development), and that id is
    what every request carries and every query filters on.

    Letting the database mint its own id instead looks harmless and is not:
    records claimed on sign-up land under the row's random id while the caller
    keeps presenting the derived one, so the sign-up reports success and the
    Library comes back empty.
    """
    existing = await session.get(Profile, profile_id)
    if existing is None:
        existing = await session.scalar(select(Profile).where(Profile.auth_subject == auth_subject))

    if existing is not None:
        if email and not existing.email:
            existing.email = email
        return existing

    profile = Profile(id=profile_id, auth_subject=auth_subject, email=email)
    session.add(profile)
    await session.flush()
    log.info("profile.created", profile_id=str(profile.id))
    return profile


async def start_anon_session(session: AsyncSession) -> AnonSession:
    anon = AnonSession(expires_at=datetime.now(UTC) + ANON_SESSION_TTL)
    session.add(anon)
    await session.flush()
    return anon


async def claim_anon_session(session: AsyncSession, *, anon_id: UUID, profile: Profile) -> int:
    """Hand anonymous work to the account that just signed up.

    A single ownership update, not a copy: nothing is re-saved, so nothing can
    be half-migrated. This is the moment the design doc's "first win before
    first signup" either keeps its promise or quietly loses someone's work.
    """
    anon = await session.get(AnonSession, anon_id)
    if anon is None or anon.is_claimed:
        return 0

    moved = 0
    for model in (JobRecord, CvVersion):
        result = await session.execute(
            select(model).where(model.profile_id == _anon_owner_id(anon_id))
        )
        for row in result.scalars():
            row.profile_id = profile.id
            moved += 1

    anon.claimed_by = profile.id
    anon.claimed_at = datetime.now(UTC)
    log.info("anon.claimed", anon_id=str(anon_id), profile_id=str(profile.id), moved=moved)
    return moved


def _anon_owner_id(anon_id: UUID) -> UUID:
    """Anonymous work is owned by the session id itself.

    Records carry a ``profile_id`` whether or not a profile exists yet, so
    claiming is one UPDATE rather than a schema with two nullable owner columns
    and a rule about which one wins.
    """
    return anon_id


async def purge_expired_anon_sessions(session: AsyncSession) -> int:
    """Delete unclaimed anonymous work past its TTL, and everything it owns."""
    now = datetime.now(UTC)
    expired = (
        (
            await session.execute(
                select(AnonSession.id).where(
                    AnonSession.claimed_by.is_(None), AnonSession.expires_at < now
                )
            )
        )
        .scalars()
        .all()
    )

    if not expired:
        return 0

    for model in (CvVersion, JobRecord):
        await session.execute(delete(model).where(model.profile_id.in_(expired)))
    await session.execute(delete(AnonSession).where(AnonSession.id.in_(expired)))

    log.info("anon.purged", sessions=len(expired))
    return len(expired)


# ═══════════════════════════════════════════════════════════════════════════
# Records
# ═══════════════════════════════════════════════════════════════════════════


async def save_record(
    session: AsyncSession, *, owner_id: UUID, payload: SaveRecordRequest
) -> RecordDetail:
    """Save an application: the frozen advert plus the CV that was sent."""
    snapshot = FrozenSnapshot.capture(
        payload.job_text,
        parsed=payload.job,
        source_url=payload.source_url,
        score=payload.score,
    )
    job = payload.job or JobPost()

    record = JobRecord(
        profile_id=owner_id,
        company=job.company,
        role=job.role,
        location=job.location,
        salary_text=job.salary_text,
        source_url=payload.source_url,
        status=payload.status,
        notes=payload.notes,
        applied_at=datetime.now(UTC) if payload.status != "saved" else None,
        frozen_snapshot=snapshot.model_dump(mode="json"),
    )
    session.add(record)
    await session.flush()

    version = CvVersion(
        profile_id=owner_id,
        job_record_id=record.id,
        filename=payload.filename,
        source_format=payload.source_format,
        content_hash=payload.content_hash,
        doc_model=payload.doc_model,
        change_log=payload.change_log,
    )
    session.add(version)
    await session.flush()

    log.info(
        "record.saved",
        record_id=str(record.id),
        company=record.company,
        changes=len(payload.change_log),
    )
    return _to_detail(record, [version])


async def list_records(
    session: AsyncSession,
    *,
    owner_id: UUID,
    query: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[RecordSummary]:
    """The Library, newest first."""
    counts = (
        select(CvVersion.job_record_id, func.count().label("cv_count"))
        .group_by(CvVersion.job_record_id)
        .subquery()
    )

    statement = (
        select(JobRecord, func.coalesce(counts.c.cv_count, 0))
        .outerjoin(counts, counts.c.job_record_id == JobRecord.id)
        .where(JobRecord.profile_id == owner_id)
        .order_by(JobRecord.created_at.desc())
        .limit(min(limit, 200))
        .offset(offset)
    )

    if status:
        statement = statement.where(JobRecord.status == status)

    if query and (term := f"%{query.strip().lower()}%") != "%%":
        # Company and role cover what people actually search for. Searching the
        # snapshot text as well means finding a record by a phrase you remember
        # from the advert, which is often all anyone remembers.
        statement = statement.where(
            or_(
                func.lower(func.coalesce(JobRecord.company, "")).like(term),
                func.lower(func.coalesce(JobRecord.role, "")).like(term),
                func.lower(func.coalesce(JobRecord.notes, "")).like(term),
                func.lower(JobRecord.frozen_snapshot.cast(String)).like(term),
            )
        )

    rows = await session.execute(statement)
    return [_to_summary(record, cv_count) for record, cv_count in rows.all()]


async def get_record(
    session: AsyncSession, *, owner_id: UUID, record_id: UUID
) -> RecordDetail | None:
    record = await session.scalar(
        select(JobRecord)
        .where(JobRecord.id == record_id, JobRecord.profile_id == owner_id)
        .options(selectinload(JobRecord.cv_versions))
    )
    if record is None:
        return None
    return _to_detail(record, sorted(record.cv_versions, key=lambda v: v.created_at))


async def update_record(
    session: AsyncSession, *, owner_id: UUID, record_id: UUID, payload: UpdateRecordRequest
) -> RecordDetail | None:
    record = await session.scalar(
        select(JobRecord)
        .where(JobRecord.id == record_id, JobRecord.profile_id == owner_id)
        .options(selectinload(JobRecord.cv_versions))
    )
    if record is None:
        return None

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    # Moving off "saved" is the moment it became a real application.
    if payload.status and payload.status != "saved" and record.applied_at is None:
        record.applied_at = datetime.now(UTC)

    return _to_detail(record, sorted(record.cv_versions, key=lambda v: v.created_at))


async def delete_record(session: AsyncSession, *, owner_id: UUID, record_id: UUID) -> bool:
    record = await session.scalar(
        select(JobRecord).where(JobRecord.id == record_id, JobRecord.profile_id == owner_id)
    )
    if record is None:
        return False
    await session.delete(record)
    log.info("record.deleted", record_id=str(record_id))
    return True


async def delete_everything(session: AsyncSession, *, owner_id: UUID) -> dict[str, int]:
    """Erase this person entirely.

    The design doc promises "plain controls to export or delete everything", and
    a delete button that leaves rows behind is worse than none at all.
    """
    counts: dict[str, int] = {}
    for name, model in (("cv_versions", CvVersion), ("records", JobRecord)):
        result = await session.execute(delete(model).where(model.profile_id == owner_id))
        counts[name] = result.rowcount or 0

    await session.execute(delete(UsageEvent).where(UsageEvent.owner_key == str(owner_id)))
    profile = await session.get(Profile, owner_id)
    if profile is not None:
        await session.delete(profile)

    log.info("profile.erased", profile_id=str(owner_id), **counts)
    return counts


# ═══════════════════════════════════════════════════════════════════════════
# Usage
# ═══════════════════════════════════════════════════════════════════════════


async def record_usage(
    session: AsyncSession,
    *,
    owner_key: str,
    kind: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    anonymous: bool,
) -> None:
    session.add(
        UsageEvent(
            owner_key=owner_key,
            kind=kind,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_micros=round(cost_usd * 1_000_000),
            anonymous=anonymous,
        )
    )


async def spend_since(session: AsyncSession, *, since: datetime) -> float:
    """Total spend in dollars since a point in time."""
    micros = await session.scalar(
        select(func.coalesce(func.sum(UsageEvent.cost_micros), 0)).where(
            UsageEvent.created_at >= since
        )
    )
    return (micros or 0) / 1_000_000


# ═══════════════════════════════════════════════════════════════════════════
# Mapping
# ═══════════════════════════════════════════════════════════════════════════


def _keywords(record: JobRecord) -> list[str]:
    parsed = (record.frozen_snapshot or {}).get("parsed") or {}
    return list(parsed.get("keywords") or [])[:8]


def _to_summary(record: JobRecord, cv_count: int) -> RecordSummary:
    return RecordSummary(
        id=record.id,
        company=record.company,
        role=record.role,
        location=record.location,
        status=record.status,  # type: ignore[arg-type]
        applied_at=record.applied_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
        cv_count=cv_count,
        keywords=_keywords(record),
        score=(record.frozen_snapshot or {}).get("score"),
    )


def _to_detail(record: JobRecord, versions: list[CvVersion]) -> RecordDetail:
    snapshot = None
    if record.frozen_snapshot:
        snapshot = FrozenSnapshot.model_validate(record.frozen_snapshot)

    return RecordDetail(
        id=record.id,
        company=record.company,
        role=record.role,
        location=record.location,
        status=record.status,  # type: ignore[arg-type]
        applied_at=record.applied_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
        cv_count=len(versions),
        keywords=_keywords(record),
        score=(record.frozen_snapshot or {}).get("score"),
        notes=record.notes,
        source_url=record.source_url,
        salary_text=record.salary_text,
        snapshot=snapshot,
        cv_versions=[
            CvVersionSummary(
                id=v.id,
                filename=v.filename,
                source_format=v.source_format,
                content_hash=v.content_hash,
                created_at=v.created_at,
                change_count=len(v.change_log or []),
                doc_model=v.doc_model or {},
            )
            for v in versions
        ],
    )
