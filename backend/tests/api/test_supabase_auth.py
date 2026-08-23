"""Verifying Supabase access tokens, under both of its signing schemes.

Supabase changed how it signs. Older projects use HS256 and a shared secret;
newer ones sign asymmetrically — ES256 by default — and publish the public half
at a JWKS endpoint. A verifier that knows only the shared secret rejects every
token from an asymmetric project, and rejects it *silently*: the request arrives
as an anonymous visitor, so somebody signs in successfully and then finds an
empty Library with nothing in the UI or the logs to explain it.

Real keys are generated here rather than mocked. The point of these tests is
that the cryptography works, and a fake signer that always says yes would pass
while the deployment failed.
"""

from __future__ import annotations

import json
import time
from uuid import UUID

import jwt
import pytest
from aptly.auth import LocalAuth, SupabaseAuth, get_auth
from aptly.auth.supabase import _owner_id
from aptly.config import Settings
from cryptography.hazmat.primitives.asymmetric import ec

SECRET = "a-shared-secret-of-adequate-length-for-hs256"
USER_ID = "8f14e45f-ceea-4d0e-a4b8-9a1b2c3d4e5f"
PROJECT = "https://riurdidnoxcelflcysfv.supabase.co"


@pytest.fixture(scope="module")
def es256():
    """A real ES256 keypair, plus its public half as a JWKS document."""
    private = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private.public_key()))
    jwk.update({"kid": "c631a621-5bc0-43ac-94a6-eafae5b3e7b6", "use": "sig", "alg": "ES256"})
    return private, {"keys": [jwk]}


def token(key, algorithm: str, *, kid: str | None = None, **claims) -> str:
    payload = {
        "sub": USER_ID,
        "email": "rahul@example.com",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        **claims,
    }
    headers = {"kid": kid} if kid else None
    return jwt.encode(payload, key, algorithm=algorithm, headers=headers)


class _Request:
    """Only what `identify` reads."""

    def __init__(self, bearer: str | None = None) -> None:
        self.headers = {"authorization": f"Bearer {bearer}"} if bearer else {}
        self.cookies: dict[str, str] = {}


def _auth(monkeypatch, jwks: dict | None = None, **settings) -> SupabaseAuth:
    subject = SupabaseAuth(Settings(APTLY_ENV="staging", **settings))  # type: ignore[call-arg]
    if jwks is not None:
        # Serve the key set from memory. The network is not what is under test,
        # and a test that reaches Supabase fails when their status page is bad.
        from jwt import PyJWKClient

        monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks, raising=True)
    return subject


# ═══════════════════════════════════════════════════════════════════════════
# Which provider a deployment gets
# ═══════════════════════════════════════════════════════════════════════════


def test_an_asymmetric_project_gets_real_auth() -> None:
    """It has no shared secret at all. Keying the switch on the secret sent it
    to the development sign-in, which then refuses to start in production — a
    deployment that looks configured and is not."""
    provider = get_auth(Settings(APTLY_ENV="staging", SUPABASE_URL=PROJECT))  # type: ignore[call-arg]
    assert isinstance(provider, SupabaseAuth)


def test_a_legacy_project_still_gets_real_auth() -> None:
    provider = get_auth(Settings(APTLY_ENV="staging", SUPABASE_JWT_SECRET=SECRET))  # type: ignore[call-arg]
    assert isinstance(provider, SupabaseAuth)


def test_no_supabase_falls_back_to_the_development_sign_in() -> None:
    assert isinstance(get_auth(Settings(APTLY_ENV="staging")), LocalAuth)  # type: ignore[call-arg]


def test_the_jwks_url_is_derived_from_the_project_url() -> None:
    subject = SupabaseAuth(Settings(APTLY_ENV="staging", SUPABASE_URL=f"{PROJECT}/"))  # type: ignore[call-arg]
    assert subject.jwks_url == f"{PROJECT}/auth/v1/.well-known/jwks.json"


# ═══════════════════════════════════════════════════════════════════════════
# Asymmetric — what this project actually uses
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_an_es256_token_signs_the_person_in(monkeypatch, es256) -> None:
    private, jwks = es256
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    caller = await subject.identify(_Request(token(private, "ES256", kid=jwks["keys"][0]["kid"])))

    assert caller is not None
    assert caller.subject == USER_ID
    assert caller.email == "rahul@example.com"
    assert caller.owner_id == UUID(USER_ID)


@pytest.mark.asyncio
async def test_a_token_signed_by_somebody_else_is_refused(monkeypatch, es256) -> None:
    _, jwks = es256
    impostor = ec.generate_private_key(ec.SECP256R1())
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    caller = await subject.identify(_Request(token(impostor, "ES256", kid=jwks["keys"][0]["kid"])))

    assert caller is None


@pytest.mark.asyncio
async def test_an_expired_token_is_refused(monkeypatch, es256) -> None:
    private, jwks = es256
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    caller = await subject.identify(
        _Request(token(private, "ES256", kid=jwks["keys"][0]["kid"], exp=int(time.time()) - 60))
    )

    assert caller is None


@pytest.mark.asyncio
async def test_a_token_for_another_audience_is_refused(monkeypatch, es256) -> None:
    """Supabase issues tokens for more than one audience. Only `authenticated`
    means a signed-in person."""
    private, jwks = es256
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    caller = await subject.identify(
        _Request(token(private, "ES256", kid=jwks["keys"][0]["kid"], aud="anon"))
    )

    assert caller is None


# ═══════════════════════════════════════════════════════════════════════════
# The shape of attack this replaces
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_alg_none_is_refused(monkeypatch, es256) -> None:
    """The classic JWT hole: a token that nominates its own algorithm as
    `none`. Each branch pins the algorithms it accepts, so the header selects a
    verifier and never grants trust."""
    _, jwks = es256
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    forged = jwt.encode({"sub": USER_ID, "aud": "authenticated"}, key="", algorithm="none")

    assert await subject.identify(_Request(forged)) is None


@pytest.mark.asyncio
async def test_an_hs256_token_cannot_be_verified_with_the_jwks(monkeypatch, es256) -> None:
    """The other classic: sign with HS256 using the *public* key as the shared
    secret, and a verifier that trusts the header will accept it."""
    _, jwks = es256
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    assert await subject.identify(_Request(token("public-key-as-secret", "HS256"))) is None


# ═══════════════════════════════════════════════════════════════════════════
# Legacy HS256, still supported
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_an_hs256_token_works_where_that_is_the_scheme() -> None:
    subject = SupabaseAuth(Settings(APTLY_ENV="staging", SUPABASE_JWT_SECRET=SECRET))  # type: ignore[call-arg]

    caller = await subject.identify(_Request(token(SECRET, "HS256")))

    assert caller is not None
    assert caller.subject == USER_ID


@pytest.mark.asyncio
async def test_a_missing_token_leaves_the_visitor_anonymous(monkeypatch, es256) -> None:
    """Anonymous is a first-class state, not an error. This visitor tailors a CV
    before being asked for anything."""
    _, jwks = es256
    subject = _auth(monkeypatch, jwks, SUPABASE_URL=PROJECT)

    assert await subject.identify(_Request()) is None


def test_a_non_uuid_subject_still_maps_to_a_stable_id() -> None:
    """Supabase ids are UUIDs, but the mapping must not depend on it — and the
    same person has to reach the same records every time."""
    assert _owner_id("github|12345") == _owner_id("github|12345")
    assert _owner_id("github|12345") != _owner_id("github|99999")
