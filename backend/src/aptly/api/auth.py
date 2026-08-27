"""Accounts: creating one, signing in to one, and getting back into one.

The interesting part is what happens *around* signing up. Claiming the
anonymous session happens in the same transaction as creating the profile, or
not at all — so the product's promise of a first win before a first signup
cannot be quietly broken by a partial failure.

The password path here is Aptly's own, and it is the one in force wherever
Supabase is not configured. It used to be email-only with no password at all,
which meant anybody who knew an address owned that account; that is now a real
credential, salted and hashed with scrypt (see :mod:`aptly.auth.passwords`).
"""

from __future__ import annotations

from uuid import UUID, uuid5

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from aptly.api.deps import (
    CallerDep,
    SessionDep,
    clear_session_cookie,
    set_session_cookie,
)
from aptly.auth import get_auth
from aptly.auth.local import DEV_NAMESPACE, LocalAuth
from aptly.auth.passwords import (
    PasswordError,
    hash_password,
    needs_rehash,
    verify,
)
from aptly.config import get_settings
from aptly.db import repository
from aptly.db.models import Profile
from aptly.errors import AptlyError
from aptly.logging import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ═══════════════════════════════════════════════════════════════════════════
# Shapes
# ═══════════════════════════════════════════════════════════════════════════


class SignUpRequest(BaseModel):
    #: What to call them. Asked for once, at sign-up, because the alternative is
    #: greeting somebody by the first half of their email address forever.
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class SignInRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class ResetRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class Session(BaseModel):
    signed_in: bool
    email: str | None = None
    name: str | None = None
    #: How many pieces of anonymous work moved into the account on sign-in.
    claimed: int = 0
    #: True when Aptly's own password sign-in is in use rather than Supabase.
    development_mode: bool = False
    #: True where a password can be reset without proving the address. See
    #: :func:`reset_password`.
    direct_reset: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# Errors
# ═══════════════════════════════════════════════════════════════════════════


class NotAvailableError(AptlyError):
    status_code = 400
    code = "auth_unavailable"


class CredentialsError(AptlyError):
    status_code = 401
    code = "bad_credentials"


class AccountExistsError(AptlyError):
    status_code = 409
    code = "account_exists"


class NoSuchAccountError(AptlyError):
    status_code = 404
    code = "no_such_account"


class WeakPasswordError(AptlyError):
    status_code = 422
    code = "weak_password"


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _require_local() -> LocalAuth:
    auth = get_auth()
    if not isinstance(auth, LocalAuth):
        raise NotAvailableError(
            "This deployment uses Supabase Auth.",
            hint="Sign in through Supabase; the browser sends its token automatically.",
        )
    return auth


def _normalise(email: str) -> str:
    return email.strip().lower()


def _owner_id(email: str) -> UUID:
    """The profile id for an address. Derived, so it is the same every time."""
    return uuid5(DEV_NAMESPACE, email)


def _checked(password: str) -> str:
    try:
        return hash_password(password)
    except PasswordError as exc:
        raise WeakPasswordError(
            str(exc),
            hint="Longer is stronger. A short phrase beats a scrambled word.",
        ) from exc


async def _find(session: SessionDep, email: str) -> Profile | None:
    profile = await session.get(Profile, _owner_id(email))
    if profile is not None:
        return profile
    return await session.scalar(select(Profile).where(Profile.auth_subject == email))


def _session_for(profile: Profile, *, claimed: int = 0) -> Session:
    settings = get_settings()
    return Session(
        signed_in=True,
        email=profile.email,
        name=profile.display_name,
        claimed=claimed,
        development_mode=True,
        direct_reset=settings.allow_direct_password_reset,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/sign-up", response_model=Session)
async def sign_up(
    payload: SignUpRequest,
    response: Response,
    caller: CallerDep,
    session: SessionDep,
) -> Session:
    """Create an account, and bring anything already tailored with it."""
    auth = _require_local()
    email = _normalise(payload.email)
    if "@" not in email:
        raise CredentialsError(
            "That does not look like an email address.",
            hint="Check for a missing @ or a typo in the domain.",
        )

    # Hashed before the existence check, so that a taken address and a free one
    # take the same time to answer. Otherwise the difference is a way to ask
    # which addresses have accounts here.
    password_hash = _checked(payload.password)

    if (existing := await _find(session, email)) and existing.password_hash:
        raise AccountExistsError(
            "There is already an account with this address.",
            hint="Sign in instead, or reset the password if you have forgotten it.",
        )

    profile = await repository.get_or_create_profile(
        session, profile_id=_owner_id(email), auth_subject=email, email=email
    )
    profile.display_name = payload.name.strip()
    profile.password_hash = password_hash

    # Anything done before signing up belongs to the anonymous session. Move it
    # now, in this transaction, so a failure cannot leave it orphaned.
    claimed = 0
    if not caller.is_authenticated:
        claimed = await repository.claim_anon_session(
            session, anon_id=caller.owner_id, profile=profile
        )

    set_session_cookie(response, auth.new_session_token(email, profile.id))
    log.info("auth.signed_up", profile_id=str(profile.id), claimed=claimed)
    return _session_for(profile, claimed=claimed)


@router.post("/sign-in", response_model=Session)
async def sign_in(
    payload: SignInRequest,
    response: Response,
    caller: CallerDep,
    session: SessionDep,
) -> Session:
    """Sign in with an email and a password."""
    auth = _require_local()
    email = _normalise(payload.email)
    profile = await _find(session, email)

    # One message for a wrong password and for an address with no account.
    # Telling them apart is telling a stranger which addresses are registered.
    if profile is None or not verify(payload.password, profile.password_hash):
        log.info("auth.sign_in_refused", email=email)
        raise CredentialsError(
            "That email and password do not match.",
            hint="Check both, or create an account if you do not have one.",
        )

    # The only moment the plaintext is in hand, so the only moment an old hash
    # can be upgraded to the current cost.
    if needs_rehash(profile.password_hash):
        profile.password_hash = hash_password(payload.password)
        log.info("auth.rehashed", profile_id=str(profile.id))

    claimed = 0
    if not caller.is_authenticated:
        claimed = await repository.claim_anon_session(
            session, anon_id=caller.owner_id, profile=profile
        )

    set_session_cookie(response, auth.new_session_token(email, profile.id))
    log.info("auth.signed_in", profile_id=str(profile.id), claimed=claimed)
    return _session_for(profile, claimed=claimed)


@router.post("/reset-password", response_model=Session)
async def reset_password(
    payload: ResetRequest,
    response: Response,
    session: SessionDep,
) -> Session:
    """Set a new password without proving the address, and sign in with it.

    **This is not how a password reset should work, and it is switched off in
    production.** Proving control of the address is the entire mechanism; skip
    it and "forgot password" becomes "take over any account whose email you can
    guess". It exists because the email step is not built yet and a demo needs
    to show the flow, and it is gated on
    ``APTLY_ALLOW_DIRECT_PASSWORD_RESET`` — which defaults to off in production
    precisely so this cannot arrive there by being forgotten about.

    When the email step lands, this endpoint is replaced rather than extended:
    the request becomes "send a link", and the reset itself moves behind a
    signed, single-use, short-lived token.
    """
    settings = get_settings()
    if not settings.allow_direct_password_reset:
        raise NotAvailableError(
            "Resetting a password needs a link sent to your address.",
            hint="Check your inbox for the reset email.",
        )

    auth = _require_local()
    email = _normalise(payload.email)
    password_hash = _checked(payload.password)

    profile = await _find(session, email)
    if profile is None:
        raise NoSuchAccountError(
            "No account here uses that address.",
            hint="Check the spelling, or create an account.",
        )

    profile.password_hash = password_hash
    set_session_cookie(response, auth.new_session_token(email, profile.id))
    log.warning("auth.password_reset_without_verification", profile_id=str(profile.id))
    return _session_for(profile)


@router.post("/sign-out", response_model=Session)
async def sign_out(response: Response) -> Session:
    clear_session_cookie(response)
    settings = get_settings()
    return Session(
        signed_in=False,
        development_mode=isinstance(get_auth(), LocalAuth),
        direct_reset=settings.allow_direct_password_reset,
    )


@router.get("/session", response_model=Session)
async def whoami(caller: CallerDep, session: SessionDep) -> Session:
    settings = get_settings()
    # Asked of the provider, not re-derived from one setting. A project that
    # signs asymmetrically has no shared secret at all and is configured by
    # SUPABASE_URL alone, so keying this on the secret reported the wrong mode
    # for the newer kind of Supabase project.
    development = isinstance(get_auth(), LocalAuth)

    name: str | None = None
    if caller.is_authenticated:
        profile = await session.get(Profile, caller.owner_id)
        name = profile.display_name if profile else None

    return Session(
        signed_in=caller.is_authenticated,
        email=caller.email,
        name=name,
        development_mode=development,
        direct_reset=settings.allow_direct_password_reset,
    )
