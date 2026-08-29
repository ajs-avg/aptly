"""The career profile endpoint.

Read and written whole. The form on the other side of this is long, people fill
it in over several sittings, and a partial save must never be rejected — so
every field is optional and a PUT replaces the document rather than patching it.

Requires an account, unlike ingest and tailor. Those work anonymously because
nothing of the user's is stored; this exists precisely to store something, so
there has to be somebody to store it against.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aptly.api.deps import require_profile
from aptly.api.limits import check_extract_quota
from aptly.db.models import Profile
from aptly.db.session import get_session
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger
from aptly.model.document import CVDocument
from aptly.profile.extract import Conflict, as_document, extract_profile, merge
from aptly.profile.schemas import CareerProfile

log = get_logger(__name__)

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileResponse(BaseModel):
    """The profile, plus the two numbers the form uses to encourage progress."""

    profile: CareerProfile
    completeness: int = Field(description="Rough percentage, weighted by what improves a rebuild.")
    #: What to fill in next, most valuable first. Shown as prompts rather than
    #: as errors — an incomplete profile is a normal state, not a mistake.
    next_steps: list[str] = Field(default_factory=list)

    @classmethod
    def of(cls, profile: CareerProfile) -> ProfileResponse:
        return cls(
            profile=profile,
            completeness=profile.completeness,
            next_steps=profile.missing_for_a_strong_rebuild(),
        )


@router.get("", response_model=ProfileResponse)
async def read_profile(row: Profile = Depends(require_profile)) -> ProfileResponse:
    """The saved profile, or an empty one for somebody who has not started."""
    return ProfileResponse.of(_load(row))


@router.put("", response_model=ProfileResponse)
async def write_profile(
    payload: CareerProfile,
    row: Profile = Depends(require_profile),
    session: AsyncSession = Depends(get_session),
) -> ProfileResponse:
    """Replace the profile.

    A replace rather than a merge: the form holds the whole document in the
    browser and sends it back, so a merge would make deleting a role impossible
    — the removed entry would simply reappear from the stored copy.
    """
    row.career_profile = payload.model_dump(mode="json")
    session.add(row)
    await session.commit()

    log.info(
        "profile.saved",
        roles=len(payload.roles),
        skills=len(payload.skills),
        projects=len(payload.projects),
        completeness=payload.completeness,
    )
    return ProfileResponse.of(payload)


# ═══════════════════════════════════════════════════════════════════════════
# Reading a CV into it
# ═══════════════════════════════════════════════════════════════════════════


class ExtractRequest(BaseModel):
    """A CV already parsed by `/api/cv/ingest`, and what to do with it."""

    document: CVDocument
    #: `merge` folds the CV into what is on file; `replace` starts from it.
    #:
    #: Merge is the default and replace is a deliberate choice, because the cost
    #: of a wrong merge is a duplicate row somebody deletes and the cost of a
    #: wrong replace is work they cannot get back.
    mode: Literal["merge", "replace"] = "merge"


class ExtractResponse(BaseModel):
    """What the CV said, folded in — but *not* saved.

    Returned for the person to check and correct first. A model writing
    straight into somebody's career history without being read is the one thing
    this whole screen exists to prevent, so saving stays a separate PUT that
    only happens when they press the button.
    """

    profile: CareerProfile
    completeness: int
    #: Where the CV disagrees with what is already on file. The existing value
    #: is kept; these are shown so the person can decide.
    conflicts: list[Conflict] = Field(default_factory=list)
    #: What the CV added, in words, so the person can see it did something.
    added: list[str] = Field(default_factory=list)
    remaining_today: int = 0


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    payload: ExtractRequest,
    request: Request,
    row: Profile = Depends(require_profile),
) -> ExtractResponse:
    """Read a CV into the career profile, without saving it.

    Deliberately does not write. The response is a proposal: the person sees
    what was read, fixes what the model got wrong, and saves with a PUT. An
    extraction that saved itself would put a model's reading of a PDF into
    somebody's career history with nobody having looked at it.
    """
    remaining = check_extract_quota(request)

    read, _ = await extract_profile(payload.document, client=GeminiClient())

    # Replace starts from an empty profile rather than skipping the merge, so
    # the same code reports what the CV added either way.
    base = CareerProfile() if payload.mode == "replace" else _load(row)
    result = merge(base, read)

    log.info(
        "profile.extract",
        mode=payload.mode,
        conflicts=len(result.conflicts),
        added=len(result.added),
    )
    return ExtractResponse(
        profile=result.profile,
        completeness=result.profile.completeness,
        conflicts=result.conflicts,
        added=result.added,
        remaining_today=remaining,
    )


class AsCvResponse(BaseModel):
    """The profile, rendered as a CV the tailoring pass can read."""

    document: CVDocument
    #: False when the profile is too thin to be worth tailoring. The screen says
    #: so rather than running a minute of analysis over four fields.
    usable: bool


@router.get("/as-cv", response_model=AsCvResponse)
async def as_cv(row: Profile = Depends(require_profile)) -> AsCvResponse:
    """Render the saved profile as a CV document.

    This is what makes keeping the profile up to date worth doing: somebody who
    has filled it in never has to find a resume file again, because the thing
    Aptly already knows *is* a CV it can tailor.

    Nothing is stored. The document is assembled on request from the profile, so
    it is never stale and there is no second copy to keep in step.
    """
    profile = _load(row)
    return AsCvResponse(document=as_document(profile), usable=not profile.is_empty)


def _load(row: Profile) -> CareerProfile:
    """Read the stored document, tolerating one written by an older shape.

    A profile that will not parse is the person's own career history, so it is
    never discarded on a validation error — the empty profile is returned and
    the stored copy is left untouched for a later migration to look at.
    """
    stored = row.career_profile or {}
    if not stored:
        return CareerProfile()
    try:
        return CareerProfile.model_validate(stored)
    except ValueError as exc:
        log.warning("profile.unreadable", profile_id=str(row.id), error=str(exc)[:200])
        return CareerProfile()
