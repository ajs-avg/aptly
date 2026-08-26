"""Signing in, and bringing your work with you.

The interesting endpoint is ``/api/auth/sign-in``. Signing up is the moment the
product either honours "first win before first signup" or quietly loses what
somebody just did — so claiming the anonymous session happens in the same
transaction as creating the profile, or not at all.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from aptly.api.deps import (
    CallerDep,
    SessionDep,
    clear_session_cookie,
    set_session_cookie,
)
from aptly.auth import get_auth
from aptly.auth.local import LocalAuth
from aptly.db import repository
from aptly.errors import AptlyError
from aptly.logging import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignInRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)


class Session(BaseModel):
    signed_in: bool
    email: str | None = None
    #: How many pieces of anonymous work moved into the account on sign-in.
    claimed: int = 0
    #: True when the development sign-in is in use, so the UI can say so.
    development_mode: bool = False


class NotAvailableError(AptlyError):
    status_code = 400
    code = "auth_unavailable"


@router.post("/sign-in", response_model=Session)
async def sign_in(
    payload: SignInRequest,
    request: Request,
    response: Response,
    caller: CallerDep,
    session: SessionDep,
) -> Session:
    """Development sign-in: an email, and your anonymous work comes with you."""
    auth = get_auth()
    if not isinstance(auth, LocalAuth):
        raise NotAvailableError(
            "This deployment uses Supabase Auth.",
            hint="Sign in through Supabase; the browser sends its token automatically.",
        )

    token, profile_id = auth.sign_in(payload.email)
    email = payload.email.strip().lower()
    profile = await repository.get_or_create_profile(
        session, profile_id=profile_id, auth_subject=email, email=email
    )

    # Anything done before signing in belongs to the anonymous session. Move it
    # now, in this transaction, so a failure cannot leave it orphaned.
    claimed = 0
    if not caller.is_authenticated:
        claimed = await repository.claim_anon_session(
            session, anon_id=caller.owner_id, profile=profile
        )

    set_session_cookie(response, token)
    log.info("auth.signed_in", profile_id=str(profile_id), claimed=claimed)
    return Session(
        signed_in=True,
        email=profile.email,
        claimed=claimed,
        development_mode=True,
    )


@router.post("/sign-out", response_model=Session)
async def sign_out(response: Response) -> Session:
    clear_session_cookie(response)
    return Session(signed_in=False, development_mode=isinstance(get_auth(), LocalAuth))


@router.get("/session", response_model=Session)
async def whoami(caller: CallerDep) -> Session:
    # Asked of the provider, not re-derived from one setting.
    #
    # This used to read `not supabase_jwt_secret`, which is a different question
    # from the one `get_auth` answers: a project that signs asymmetrically has no
    # shared secret at all and is configured by SUPABASE_URL alone. With only
    # that set, the API was verifying Supabase tokens while this endpoint
    # reported the development sign-in — so the one call you would make to find
    # out which mode a deployment is in gave the wrong answer for the newer of
    # the two Supabase projects.
    return Session(
        signed_in=caller.is_authenticated,
        email=caller.email,
        development_mode=isinstance(get_auth(), LocalAuth),
    )
