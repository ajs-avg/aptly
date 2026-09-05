"""The Library.

Saving an application, listing them, opening one, and erasing everything.

Anonymous callers can save too. Their records belong to their session and are
claimed the moment they sign up, which is the design doc's rule taken
literally: ask for an account when the value is obvious, not before.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from aptly.api.deps import CallerDep, SessionDep, SignedInDep
from aptly.api.limits import check_agent_quota
from aptly.db import repository
from aptly.db.schemas import (
    STATUSES,
    RecordDetail,
    RecordSummary,
    SaveRecordRequest,
    UpdateRecordRequest,
)
from aptly.errors import AptlyError
from aptly.interview import prepare_interview
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger
from aptly.model.document import CVDocument

log = get_logger(__name__)

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


@router.post("/{record_id}/interview")
async def interview(
    record_id: UUID, request: Request, caller: CallerDep, session: SessionDep
) -> EventSourceResponse:
    """The preparation sheet for one application, streamed.

    Both halves are already in the record — the advert as it was, and the
    document that went — which is what makes the questions the real ones.
    Streamed like every other model call, so a proxy never mistakes thinking
    for an idle connection.
    """
    remaining_after = check_agent_quota(request)
    del remaining_after  # Consumed for rate limiting; the sheet has no quota display.

    record = await repository.get_record(session, owner_id=caller.owner_id, record_id=record_id)
    if record is None:
        raise RecordNotFoundError(
            "That application is not in your Library.",
            hint="It may belong to a different account, or have been deleted.",
        )
    if record.snapshot is None or not record.snapshot.raw.strip():
        raise RecordNotFoundError(
            "This record has no saved job post to prepare against.",
            hint="Interview prep needs the advert; this one was saved without it.",
        )

    cv_text = ""
    for version in reversed(record.cv_versions):
        if version.doc_model:
            try:
                cv_text = CVDocument.model_validate(version.doc_model).plain_text()
                break
            except ValueError:
                continue
    if not cv_text:
        raise RecordNotFoundError(
            "This record has no saved CV to prepare from.",
            hint="It was saved before Aptly kept the document itself.",
        )

    job_text = record.snapshot.raw

    async def events() -> AsyncIterator[dict[str, str]]:
        yield _event({"kind": "working"})

        work: asyncio.Task | None = None
        try:
            work = asyncio.create_task(
                prepare_interview(job_text, cv_text, client=GeminiClient())
            )
            while True:
                done, _ = await asyncio.wait({work}, timeout=10)
                if done:
                    break
                if await request.is_disconnected():
                    log.info("interview.client_disconnected")
                    return
                yield _event({"kind": "working"})

            prep, _ = work.result()
            yield _event(prep.model_dump(mode="json"))
        except AptlyError as exc:
            yield _event({"kind": "error", "message": exc.detail, "hint": exc.hint})
        except Exception as exc:
            log.exception("interview.failed", error=str(exc)[:300])
            yield _event(
                {
                    "kind": "error",
                    "message": "Aptly could not finish the preparation sheet.",
                    "hint": "Try again in a moment.",
                }
            )
        finally:
            if work is not None and not work.done():
                work.cancel()

    return EventSourceResponse(events())


def _event(data: dict) -> dict[str, str]:
    return {"event": str(data.get("kind", "message")), "data": json.dumps(data)}


@router.post("/erase-everything", response_model=Erased)
async def erase_everything(caller: SignedInDep, session: SessionDep) -> Erased:
    """Delete this account and everything in it.

    The design doc promises plain controls to export or delete everything, and
    a delete that leaves rows behind is worse than no delete at all.
    """
    counts = await repository.delete_everything(session, owner_id=caller.owner_id)
    return Erased(records=counts.get("records", 0), cv_versions=counts.get("cv_versions", 0))
