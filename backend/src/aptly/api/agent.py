"""Talking to one CV.

Deliberately stateless. The conversation, and everything the person has said
during it, live in the browser and come back with each message — which is what
makes "session only, nothing stored" true rather than merely intended, and what
lets the two agents share what somebody said without either reading the other's
document.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from aptly.agent import run_agent
from aptly.agent.schemas import AgentRequest, AgentResponse
from aptly.api.deps import require_profile
from aptly.api.limits import check_agent_quota
from aptly.api.profile import _load
from aptly.db.models import Profile
from aptly.errors import ParseError
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger
from aptly.model.document import CVDocument

log = get_logger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/edit", response_model=AgentResponse)
async def edit(
    payload: AgentRequest,
    request: Request,
    row: Profile = Depends(require_profile),
) -> AgentResponse:
    """One turn with the agent for one document."""
    remaining = check_agent_quota(request)

    try:
        document = CVDocument.model_validate(payload.document)
    except ValueError as exc:
        raise ParseError(
            "Aptly could not read that CV.",
            hint="Reload the page and try again.",
        ) from exc

    response, _ = await run_agent(payload, document, client=GeminiClient(), profile=_load(row))
    response.remaining_today = remaining
    return response
