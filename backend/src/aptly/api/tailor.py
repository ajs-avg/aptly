"""The tailoring endpoint.

Server-sent events rather than one long POST, because the perceived speed of
this screen *is* the product. The first change card lands a second or two in,
while the rest of the document is still being worked on — the person watches
their CV improve instead of watching a spinner.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import asdict, is_dataclass

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from aptly.api.deps import CallerDep, SessionDep
from aptly.api.limits import check_tailor_quota
from aptly.auth import Caller
from aptly.db.models import Profile
from aptly.errors import AptlyError
from aptly.llm.client import GeminiClient
from aptly.llm.tailor import Mode, RunFailed, tailor
from aptly.logging import get_logger
from aptly.model.document import CVDocument
from aptly.profile.schemas import CareerProfile

log = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["tailor"])

MAX_JOB_POST_CHARS = 60_000


class TailorRequest(BaseModel):
    document: CVDocument
    job_text: str = Field(min_length=40, max_length=MAX_JOB_POST_CHARS)
    #: Story Bank items, keyed by id. Empty until the user has built one, which
    #: is why the tailoring pass has to work well without it.
    stories: dict[str, str] = Field(default_factory=dict)
    #: "suggest" edits individual lines and moves nothing. "redesign" also
    #: reorders sections, entries and bullets, and may leave out what is not
    #: earning its space. Defaults to the conservative one on purpose: a person
    #: who has not asked for their CV to be restructured should not have it
    #: restructured.
    mode: Mode = "suggest"


@router.post("/tailor")
async def tailor_stream(
    request: Request,
    payload: TailorRequest,
    caller: CallerDep,
    session: SessionDep,
) -> EventSourceResponse:
    """Stream change cards as they are generated and validated."""
    remaining = check_tailor_quota(request)
    profile = await _career_profile(caller, session)

    async def events() -> AsyncIterator[dict[str, str]]:
        yield _event({"kind": "start", "remaining_today": remaining, "mode": payload.mode})
        try:
            async for event in tailor(
                payload.document,
                payload.job_text,
                client=GeminiClient(),
                stories=payload.stories or None,
                profile=profile,
                mode=payload.mode,
            ):
                if await request.is_disconnected():
                    log.info("tailor.client_disconnected")
                    return
                yield _event(_encode(event))
        except AptlyError as exc:
            yield _event(_encode(RunFailed(message=exc.detail, hint=exc.hint)))
        except Exception as exc:
            log.exception("tailor.failed", error=str(exc)[:300])
            yield _event(
                _encode(
                    RunFailed(
                        message="Aptly could not finish tailoring this CV.",
                        hint="Try again in a moment. Your CV has not been changed.",
                    )
                )
            )

    return EventSourceResponse(events())


def _encode(event: object) -> dict:
    """Dataclass or Pydantic model to a JSON-ready dict."""
    if is_dataclass(event) and not isinstance(event, type):
        return {key: _plain(value) for key, value in asdict(event).items()}
    if isinstance(event, BaseModel):
        return event.model_dump(mode="json")
    return {"value": event}


def _plain(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    return value


def _event(data: dict) -> dict[str, str]:
    import json

    return {"event": str(data.get("kind", "message")), "data": json.dumps(data)}


async def _career_profile(caller: Caller, session: SessionDep) -> CareerProfile | None:
    """The signed-in person's profile, if they have one.

    Anonymous callers get None rather than an error. Tailoring has always worked
    without an account and must keep doing so — the profile makes the rebuilt CV
    fuller, it is not a condition of getting one.

    A read, never a write: an unfilled profile row should not be created just
    because somebody tailored a CV.
    """
    if not caller.is_authenticated:
        return None

    row = await session.get(Profile, caller.owner_id)
    if row is None:
        row = await session.scalar(
            select(Profile).where(Profile.auth_subject == (caller.subject or ""))
        )
    if row is None or not row.career_profile:
        return None

    try:
        return CareerProfile.model_validate(row.career_profile)
    except ValueError as exc:
        # Their own career history — never discarded over a parse failure, and
        # never allowed to take the tailoring run down with it.
        log.warning("tailor.profile_unreadable", error=str(exc)[:200])
        return None
