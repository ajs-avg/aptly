"""Request dependencies.

The one that matters is :func:`current_caller`. Every request has an owner —
either a signed-in profile or an anonymous session created on the spot — so no
handler ever has to ask "is anyone there?" before doing useful work. That is
what makes "first win before first signup" a property of the system rather than
a special case bolted onto each endpoint.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from aptly.auth import Caller, get_auth
from aptly.auth.cookies import ANON_COOKIE, SESSION_COOKIE, TTL_SECONDS
from aptly.config import get_settings
from aptly.db import repository
from aptly.db.models import Profile
from aptly.db.session import get_session
from aptly.errors import AptlyError
from aptly.logging import get_logger

log = get_logger(__name__)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class NotSignedInError(AptlyError):
    status_code = 401
    code = "not_signed_in"


async def current_caller(
    request: Request,
    response: Response,
    session: SessionDep,
) -> Caller:
    """Who is asking, creating an anonymous session if nobody is.

    The cookie is set on the response as a side effect, which is the only way a
    first-time visitor can accumulate work across requests without being asked
    to sign up first.
    """
    auth = get_auth()
    if caller := await auth.identify(request):
        return caller

    anon = await repository.start_anon_session(session)
    token = auth.new_anon_token(anon.id)
    response.set_cookie(
        ANON_COOKIE,
        token,
        max_age=TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=get_settings().is_deployed,
    )
    log.info("anon.started", anon_id=str(anon.id))
    return Caller(owner_id=anon.id)


CallerDep = Annotated[Caller, Depends(current_caller)]


async def signed_in_caller(caller: CallerDep) -> Caller:
    """For endpoints that genuinely need an account."""
    if not caller.is_authenticated:
        raise NotSignedInError(
            "You need an account to do that.",
            hint="Sign in and your current work comes with you — nothing is lost.",
        )
    return caller


SignedInDep = Annotated[Caller, Depends(signed_in_caller)]


async def require_profile(caller: SignedInDep, session: SessionDep) -> Profile:
    """The signed-in person's profile row, created on first sight.

    Separate from :func:`signed_in_caller` because most endpoints only need to
    know *who* is asking, and loading a row they will not touch would be a
    query per request for nothing.
    """
    return await repository.get_or_create_profile(
        session,
        profile_id=caller.owner_id,
        auth_subject=caller.subject or str(caller.owner_id),
        email=caller.email,
    )


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=get_settings().is_deployed,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE)
