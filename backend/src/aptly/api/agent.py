"""Talking to one CV.

Deliberately stateless. The conversation, and everything the person has said
during it, live in the browser and come back with each message — which is what
makes "session only, nothing stored" true rather than merely intended, and what
lets the two agents share what somebody said without either reading the other's
document.

Server-sent events rather than one long POST, as `/api/tailor` already is — and
not for progress, because there is none to show: the answer arrives whole. The
agent thinks for the twenty to sixty seconds a model takes, and a request that
sits silent that long is not reliably a request that finishes. A proxy sees an
idle connection and closes it, and the page it substitutes carries none of our
CORS headers — so the browser reports a missing Access-Control-Allow-Origin, a
true statement about a response this application never sent. A keep-alive goes
out before any work starts and again while it runs, so the connection is never
idle and a failure arrives as an event this app wrote rather than as an HTML
page it did not.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from aptly.agent import run_agent
from aptly.agent.schemas import AgentRequest
from aptly.api.deps import require_profile
from aptly.api.limits import check_agent_quota
from aptly.api.profile import _load
from aptly.db.models import Profile
from aptly.errors import AptlyError, ParseError
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger
from aptly.model.document import CVDocument

log = get_logger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])

#: How often a keep-alive frame goes out while the model is thinking. Well
#: under any proxy's idle timeout, which is measured in tens of seconds.
_HEARTBEAT_SECONDS = 10


@router.post("/edit")
async def edit(
    payload: AgentRequest,
    request: Request,
    row: Profile = Depends(require_profile),
) -> EventSourceResponse:
    """One turn with the agent for one document, streamed.

    Auth, quota and parsing stay in front of the stream: they answer instantly,
    so they can be ordinary HTTP errors, which is what the browser's `fail`
    path already reads. Only the slow part — the model — happens inside.
    """
    remaining = check_agent_quota(request)

    try:
        document = CVDocument.model_validate(payload.document)
    except ValueError as exc:
        raise ParseError(
            "Aptly could not read that CV.",
            hint="Reload the page and try again.",
        ) from exc

    profile = _load(row)

    async def events() -> AsyncIterator[dict[str, str]]:
        # The first frame goes out before any work starts, so the connection is
        # held from the first moment rather than after the model answers.
        yield _event({"kind": "working"})

        turn: asyncio.Task | None = None
        try:
            # Built inside the try: a missing API key raises here, and from
            # this point on every failure must leave as an event, not as a
            # broken stream.
            turn = asyncio.create_task(
                run_agent(payload, document, client=GeminiClient(), profile=profile)
            )
            while True:
                done, _ = await asyncio.wait({turn}, timeout=_HEARTBEAT_SECONDS)
                if done:
                    break
                if await request.is_disconnected():
                    log.info("agent.client_disconnected")
                    return
                yield _event({"kind": "working"})

            response, _ = turn.result()
            response.remaining_today = remaining
            yield _event(response.model_dump(mode="json"))
        except AptlyError as exc:
            yield _event({"kind": "error", "message": exc.detail, "hint": exc.hint})
        except Exception as exc:
            log.exception("agent.failed", error=str(exc)[:300])
            yield _event(
                {
                    "kind": "error",
                    "message": "The agent could not finish that.",
                    "hint": "Ask again in a moment. Your CV has not been changed.",
                }
            )
        finally:
            if turn is not None and not turn.done():
                turn.cancel()

    return EventSourceResponse(events())


def _event(data: dict) -> dict[str, str]:
    """One SSE frame. The browser reads only the `data:` lines and tells the
    frames apart by the `kind` inside, so the answer — the one event with no
    `kind` — is whatever is left."""
    return {"event": str(data.get("kind", "message")), "data": json.dumps(data)}
