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
from typing import Any
from uuid import UUID

from sqlalchemy import String, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aptly.db.models import AnonSession, CvVersion, JobRecord, Profile, UsageEvent
from aptly.db.schemas import (
    CvVersionSummary,
    FrozenSnapshot,
    RecordDetail,
    RecordMatch,
    RecordSummary,
    SaveRecordRequest,
    ShapeLine,
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


async def find_matching_record(
    session: AsyncSession, *, owner_id: UUID, payload: SaveRecordRequest
) -> RecordMatch | None:
    """The application this save would duplicate, if there is one.

    One tailoring run produces two finished CVs, and approving both used to
    open two Library rows with the same job title and no way to tell which
    document went to the employer. That is the one question the Library exists
    to answer, so the save path asks it instead of guessing.

    Two strengths of match, because they need different wording in front of
    the person:

    - **Exact** — the advert's SHA-256 is the same. It is the same job; the
      only open question is which CV was sent.
    - **Likely** — same company and same role, different wording. Could be a
      re-paste, could genuinely be a second opening. The person decides.

    Only records that still have a CV on them are offered: a record whose
    versions were all deleted has nothing to compare against.
    """
    snapshot = FrozenSnapshot.capture(payload.job_text, parsed=payload.job)
    job = payload.job or JobPost()

    rows = (
        await session.execute(
            select(JobRecord)
            .where(JobRecord.profile_id == owner_id)
            .order_by(JobRecord.created_at.desc())
            .limit(200)
        )
    ).scalars()

    likely: JobRecord | None = None
    for record in rows:
        stored = record.frozen_snapshot or {}
        if stored.get("content_hash") and stored["content_hash"] == snapshot.content_hash:
            versions = await _versions_of(session, record.id)
            return RecordMatch(record=_to_detail(record, versions), exact=True)

        if likely is None and job.company and job.role:
            same_company = _looks_same(record.company, job.company)
            same_role = _looks_same(record.role, job.role)
            if same_company and same_role:
                likely = record

    if likely is None:
        return None
    versions = await _versions_of(session, likely.id)
    return RecordMatch(record=_to_detail(likely, versions), exact=False)


def _looks_same(left: str | None, right: str | None) -> bool:
    """Case- and space-insensitive equality, which is all a title deserves."""
    if not left or not right:
        return False
    return " ".join(left.lower().split()) == " ".join(right.lower().split())


async def _versions_of(session: AsyncSession, record_id: UUID) -> list[CvVersion]:
    return list(
        (
            await session.execute(
                select(CvVersion)
                .where(CvVersion.job_record_id == record_id)
                .order_by(CvVersion.created_at.asc())
            )
        ).scalars()
    )


async def save_record(
    session: AsyncSession, *, owner_id: UUID, payload: SaveRecordRequest
) -> RecordDetail:
    """Save an application: the frozen advert plus the CV that was sent.

    With ``record_id`` set the CV joins an application already in the Library
    rather than opening a second one for the same job. The advert is not
    recaptured in that case — the frozen copy is the one from the day they
    first saved it, and overwriting it would quietly lose the thing the record
    is for.
    """
    if payload.record_id is not None:
        return await _attach_version(session, owner_id=owner_id, payload=payload)

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
        variant=payload.variant,
        sent=payload.sent,
    )
    session.add(version)
    await session.flush()

    log.info(
        "record.saved",
        record_id=str(record.id),
        company=record.company,
        changes=len(payload.change_log),
        variant=payload.variant,
    )
    return _to_detail(record, [version])


async def _attach_version(
    session: AsyncSession, *, owner_id: UUID, payload: SaveRecordRequest
) -> RecordDetail:
    """Add a CV to an application that is already in the Library."""
    record = (
        await session.execute(
            select(JobRecord).where(
                JobRecord.id == payload.record_id, JobRecord.profile_id == owner_id
            )
        )
    ).scalar_one_or_none()
    if record is None:
        raise LookupError("record not found")

    existing = await _versions_of(session, record.id)

    # The same document saved twice is not a second version of anything. It
    # happens on a double press and on a re-save after an unrelated edit
    # elsewhere, and a Library that shows the same CV twice is lying about how
    # many it holds.
    twin = next(
        (
            v
            for v in existing
            if payload.content_hash
            and v.content_hash == payload.content_hash
            and v.variant == payload.variant
        ),
        None,
    )
    if twin is not None:
        version = twin
        version.doc_model = payload.doc_model or version.doc_model
        version.change_log = payload.change_log or version.change_log
    else:
        version = CvVersion(
            profile_id=owner_id,
            job_record_id=record.id,
            filename=payload.filename,
            source_format=payload.source_format,
            content_hash=payload.content_hash,
            doc_model=payload.doc_model,
            change_log=payload.change_log,
            variant=payload.variant,
            parent_id=existing[-1].id if existing else None,
        )
        session.add(version)

    if payload.sent:
        for other in existing:
            if other.id != version.id:
                other.sent = False
        version.sent = True
    elif payload.sent is False:
        version.sent = False

    # Saving a second CV against a job usually means the application went out,
    # so the status moves up — but never backwards from something the person
    # has set by hand.
    if payload.status != "saved" and record.status == "saved":
        record.status = payload.status
        record.applied_at = record.applied_at or datetime.now(UTC)
    if payload.notes:
        record.notes = payload.notes

    await session.flush()
    versions = await _versions_of(session, record.id)

    log.info(
        "record.version_added",
        record_id=str(record.id),
        versions=len(versions),
        variant=payload.variant,
        sent=bool(payload.sent),
        deduped=twin is not None,
    )
    return _to_detail(record, versions)


async def mark_version_sent(
    session: AsyncSession, *, owner_id: UUID, record_id: UUID, version_id: UUID
) -> RecordDetail | None:
    """Say which of a record's CVs went to the employer."""
    record = (
        await session.execute(
            select(JobRecord).where(JobRecord.id == record_id, JobRecord.profile_id == owner_id)
        )
    ).scalar_one_or_none()
    if record is None:
        return None

    versions = await _versions_of(session, record_id)
    if not any(v.id == version_id for v in versions):
        return None

    for version in versions:
        version.sent = version.id == version_id
    await session.flush()
    return _to_detail(record, versions)


async def list_records(
    session: AsyncSession,
    *,
    owner_id: UUID,
    query: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[RecordSummary]:
    """The Library, newest first.

    The versions are loaded with the records rather than counted in SQL,
    because the list now shows which CV went out and draws its shape. Both
    need the row itself, and a record holds one or two versions, not a feed.
    """
    statement = (
        select(JobRecord)
        .where(JobRecord.profile_id == owner_id)
        .options(selectinload(JobRecord.cv_versions))
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

    rows = (await session.execute(statement)).scalars()
    return [
        _to_summary(record, sorted(record.cv_versions, key=lambda v: v.created_at))
        for record in rows
    ]


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


#: How many lines of a CV the thumbnail draws. A page's worth of silhouette.
_SHAPE_LINES = 26
#: Characters that fill the column at thumbnail scale. Only the ratio matters.
_SHAPE_CHARS = 92


def _width(text: str | None) -> int:
    if not text or not text.strip():
        return 0
    return max(12, min(100, round(len(text.strip()) / _SHAPE_CHARS * 100)))


def _shape_of(doc: dict[str, Any] | None) -> list[ShapeLine]:
    """A stored CVDocument as the handful of numbers a thumbnail needs.

    Lossy on purpose. The person recognises their own CV by where the sections
    break and how long the lines run, which survives; the words do not need to.
    """
    if not doc or not isinstance(doc, dict):
        return []

    out: list[ShapeLine] = []
    contact = doc.get("contact") or {}
    if contact.get("name"):
        out.append(ShapeLine(w=46, k="n"))
    meta = " · ".join(
        str(contact.get(key)) for key in ("email", "phone", "location") if contact.get(key)
    )
    if meta:
        out.append(ShapeLine(w=min(72, _width(meta) + 20), k="c"))

    for section in doc.get("sections") or []:
        if len(out) >= _SHAPE_LINES:
            break
        if title := section.get("title"):
            out.append(ShapeLine(w=max(18, round(_width(title) * 0.55)), k="h"))
        for node in section.get("loose_nodes") or []:
            if len(out) >= _SHAPE_LINES:
                break
            out.append(ShapeLine(w=_width(node.get("text")), k="b"))
        for entry in section.get("entries") or []:
            if len(out) >= _SHAPE_LINES:
                break
            heading = " · ".join(
                str(entry[key]) for key in ("role", "org") if entry.get(key)
            )
            if heading:
                out.append(ShapeLine(w=min(80, _width(heading) + 22), k="r"))
            for bullet in entry.get("bullets") or []:
                if len(out) >= _SHAPE_LINES:
                    break
                out.append(ShapeLine(w=_width(bullet.get("text")), k="b"))

    return [line for line in out[:_SHAPE_LINES] if line.w > 0]


def _shown_version(versions: list[CvVersion]) -> CvVersion | None:
    """The one the Library should draw: the sent one, else the newest."""
    if not versions:
        return None
    return next((v for v in versions if v.sent), versions[-1])


def _to_summary(record: JobRecord, versions: list[CvVersion]) -> RecordSummary:
    shown = _shown_version(versions)
    sent = next((v for v in versions if v.sent), None)
    return RecordSummary(
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
        sent_variant=sent.variant if sent else None,
        variants=[v.variant for v in versions if v.variant],
        cv_shape=_shape_of(shown.doc_model if shown else None),
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
                variant=v.variant,
                sent=v.sent,
                doc_model=v.doc_model or {},
            )
            for v in versions
        ],
    )
