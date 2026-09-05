"""The cover letter endpoint.

Streamed for the same reason the agent is: a model call is twenty to sixty
seconds of silence, and a proxy that sees an idle connection closes it and
substitutes a page with nobody's CORS headers on it. A keep-alive goes out
before any work starts; failures leave as events this app wrote.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from aptly.api.deps import CallerDep, SessionDep
from aptly.api.limits import check_agent_quota
from aptly.api.tailor import _career_profile
from aptly.errors import AptlyError, ParseError
from aptly.letter import MAX_JOB_POST_CHARS, LetterUnsupportedError, write_letter
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger
from aptly.model.document import CVDocument

log = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["letter"])

_HEARTBEAT_SECONDS = 10


class LetterRequest(BaseModel):
    document: object = Field(description="The CVDocument the letter should draw on.")
    job_text: str = Field(min_length=40, max_length=MAX_JOB_POST_CHARS)


@router.post("/cover-letter")
async def cover_letter(
    payload: LetterRequest,
    request: Request,
    caller: CallerDep,
    session: SessionDep,
) -> EventSourceResponse:
    """Write one cover letter for one job, streamed.

    Anonymous callers welcome, exactly as tailoring is: the letter makes the
    product's case before the account does. It shares the conversational
    quota rather than the tailoring one — a letter per draft is chat-shaped
    use, and it must not eat the runs somebody came for.
    """
    remaining = check_agent_quota(request)

    try:
        document = CVDocument.model_validate(payload.document)
    except ValueError as exc:
        raise ParseError(
            "Aptly could not read that CV.",
            hint="Reload the page and try again.",
        ) from exc

    profile = await _career_profile(caller, session)

    async def events() -> AsyncIterator[dict[str, str]]:
        yield _event({"kind": "working"})

        work: asyncio.Task | None = None
        try:
            work = asyncio.create_task(
                write_letter(
                    document, payload.job_text, client=GeminiClient(), profile=profile
                )
            )
            while True:
                done, _ = await asyncio.wait({work}, timeout=_HEARTBEAT_SECONDS)
                if done:
                    break
                if await request.is_disconnected():
                    log.info("letter.client_disconnected")
                    return
                yield _event({"kind": "working"})

            letter, _ = work.result()
            yield _event(
                {**letter.model_dump(mode="json"), "remaining_today": remaining}
            )
        except LetterUnsupportedError as exc:
            yield _event(
                {
                    "kind": "error",
                    "message": "The draft claimed something your material does not back up, so it was not kept.",
                    "hint": f"{exc.detail} Try again — drafts vary.",
                }
            )
        except AptlyError as exc:
            yield _event({"kind": "error", "message": exc.detail, "hint": exc.hint})
        except Exception as exc:
            log.exception("letter.failed", error=str(exc)[:300])
            yield _event(
                {
                    "kind": "error",
                    "message": "Aptly could not finish the letter.",
                    "hint": "Try again in a moment.",
                }
            )
        finally:
            if work is not None and not work.done():
                work.cancel()

    return EventSourceResponse(events())


def _event(data: dict) -> dict[str, str]:
    return {"event": str(data.get("kind", "message")), "data": json.dumps(data)}
