"""The Library.

Saving an application, listing them, opening one, and erasing everything.

Anonymous callers can save too. Their records belong to their session and are
claimed the moment they sign up, which is the design doc's rule taken
literally: ask for an account when the value is obvious, not before.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel

from aptly.api.deps import CallerDep, SessionDep, SignedInDep
from aptly.db import repository
from aptly.db.schemas import (
    STATUSES,
    RecordDetail,
    RecordSummary,
    SaveRecordRequest,
    UpdateRecordRequest,
)
from aptly.errors import AptlyError

router = APIRouter(prefix="/api/records", tags=["library"])


class RecordNotFoundError(AptlyError):
    status_code = 404
    code = "record_not_found"


class LibraryPage(BaseModel):
    records: list[RecordSummary]
    total_shown: int
    statuses: list[str] = list(STATUSES)
    anonymous: bool


class Erased(BaseModel):
    records: int
    cv_versions: int


@router.post("", response_model=RecordDetail, status_code=201)
async def save(payload: SaveRecordRequest, caller: CallerDep, session: SessionDep) -> RecordDetail:
    """Save the job post and the CV that was sent for it."""
    if caller.is_authenticated:
        await repository.get_or_create_profile(
            session,
            profile_id=caller.owner_id,
            auth_subject=caller.subject or "",
            email=caller.email,
        )
    return await repository.save_record(session, owner_id=caller.owner_id, payload=payload)


@router.get("", response_model=LibraryPage)
async def index(
    caller: CallerDep,
    session: SessionDep,
    q: str | None = Query(default=None, description="Search company, role, notes or the advert."),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> LibraryPage:
    records = await repository.list_records(
        session, owner_id=caller.owner_id, query=q, status=status, limit=limit, offset=offset
    )
    return LibraryPage(
        records=records,
        total_shown=len(records),
        anonymous=not caller.is_authenticated,
    )


@router.get("/{record_id}", response_model=RecordDetail)
async def show(record_id: UUID, caller: CallerDep, session: SessionDep) -> RecordDetail:
    record = await repository.get_record(session, owner_id=caller.owner_id, record_id=record_id)
    if record is None:
        raise RecordNotFoundError(
            "That application is not in your Library.",
            hint="It may belong to a different account, or have been deleted.",
        )
    return record


@router.patch("/{record_id}", response_model=RecordDetail)
async def update(
    record_id: UUID, payload: UpdateRecordRequest, caller: CallerDep, session: SessionDep
) -> RecordDetail:
    record = await repository.update_record(
        session, owner_id=caller.owner_id, record_id=record_id, payload=payload
    )
    if record is None:
        raise RecordNotFoundError("That application is not in your Library.")
    return record


@router.delete("/{record_id}", status_code=204)
async def destroy(record_id: UUID, caller: CallerDep, session: SessionDep) -> None:
    if not await repository.delete_record(session, owner_id=caller.owner_id, record_id=record_id):
        raise RecordNotFoundError("That application is not in your Library.")


@router.post("/erase-everything", response_model=Erased)
async def erase_everything(caller: SignedInDep, session: SessionDep) -> Erased:
    """Delete this account and everything in it.

    The design doc promises plain controls to export or delete everything, and
    a delete that leaves rows behind is worse than no delete at all.
    """
    counts = await repository.delete_everything(session, owner_id=caller.owner_id)
    return Erased(records=counts.get("records", 0), cv_versions=counts.get("cv_versions", 0))
