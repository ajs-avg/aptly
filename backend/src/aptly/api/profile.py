"""The career profile endpoint.

Read and written whole. The form on the other side of this is long, people fill
it in over several sittings, and a partial save must never be rejected — so
every field is optional and a PUT replaces the document rather than patching it.

Requires an account, unlike ingest and tailor. Those work anonymously because
nothing of the user's is stored; this exists precisely to store something, so
there has to be somebody to store it against.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aptly.api.deps import require_profile
from aptly.db.models import Profile
from aptly.db.session import get_session
from aptly.logging import get_logger
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
