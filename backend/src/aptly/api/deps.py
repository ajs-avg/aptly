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
from aptly.auth.cookies import (
    ANON_COOKIE,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    TTL_SECONDS,
    CookieSigner,
    cookie_policy,
    should_renew,
)
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
        _renew(request, response)
        return caller

    anon = await repository.start_anon_session(session)
    token = auth.new_anon_token(anon.id)
    response.set_cookie(
        ANON_COOKIE,
        token,
        max_age=TTL_SECONDS,
        **cookie_policy(get_settings()),  # type: ignore[arg-type]
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


def _renew(request: Request, response: Response) -> None:
    """Push a still-valid cookie's expiry back, so using the product keeps you in.

    A fixed expiry counts from the moment you signed in and ignores everything
    you have done since — so somebody who opens Aptly every day is signed out on
    the thirtieth, which is precisely the person who should never see a sign-in
    screen. Each request past the halfway mark re-issues the cookie for a full
    term; only long *absence* ends a session.

    Deliberately not on every request: a `Set-Cookie` header on every response
    is one nothing needed, and it makes the response uncacheable.

    Signing the new cookie here rather than asking the auth provider for one
    keeps this to the two cookies it owns. Under Supabase a signed-in caller
    carries a bearer token and has no session cookie at all, and renewing a
    token we did not mint is not this function's business.
    """
    settings = get_settings()
    signer = CookieSigner(settings)
    policy = cookie_policy(settings)

    for name, ttl in ((SESSION_COOKIE, SESSION_TTL_SECONDS), (ANON_COOKIE, TTL_SECONDS)):
        raw = request.cookies.get(name)
        if not raw:
            continue
        claims = signer.verify(raw)
        if not claims or not should_renew(float(claims.get("exp", 0)), ttl):
            continue
        # Re-signed rather than re-sent: the payload carries its own `exp`, so a
        # longer `max_age` on the same token buys nothing — the server would go
        # on rejecting it at the original time.
        fresh = {key: value for key, value in claims.items() if key != "exp"}
        response.set_cookie(name, signer.sign(fresh, ttl), max_age=ttl, **policy)  # type: ignore[arg-type]


def set_session_cookie(response: Response, token: str) -> None:
    """Sign somebody in for a month, on a cookie that will actually come back.

    The marking is the whole thing here — see :func:`cookie_policy`. Deployed,
    the web app and the API are different *sites*, and the `SameSite=Lax` this
    used to carry meant the browser accepted the cookie and then never sent it
    again. Sign-in appeared to work and did not stick, which is what "I have to
    log in every time" was.
    """
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_SECONDS,
        **cookie_policy(get_settings()),  # type: ignore[arg-type]
    )


def clear_session_cookie(response: Response) -> None:
    # Deleted with the same marking it was set with. A `Set-Cookie` whose
    # attributes do not match is a *different* cookie as far as the browser is
    # concerned, so the original is left in place and sign-out does nothing.
    policy = cookie_policy(get_settings())
    response.delete_cookie(
        SESSION_COOKIE,
        path=str(policy["path"]),
        samesite=policy["samesite"],  # type: ignore[arg-type]
        secure=bool(policy["secure"]),
        httponly=True,
    )
