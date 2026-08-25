"""Signing in once, and staying signed in.

Two faults lived here, and both looked identical from a browser: you sign in,
it works, and the next request is anonymous again.

1. **The cookie never came back.** Deployed, the web app and the API are two
   hosts under `onrender.com`, which is on the Public Suffix List — so they are
   different *sites*, not merely different origins, and a `SameSite=Lax` cookie
   is not sent on a cross-site `fetch` at all. Local development hid it
   completely: `localhost:3000` and `localhost:8000` differ only by port and are
   same-site, so Lax is sent and everything works on a laptop.

2. **The session expired on a timer that ignored use.** A fixed term counts from
   the moment you signed in, so somebody using Aptly daily is signed out on the
   last day regardless.
"""

from __future__ import annotations

import time

import pytest
from aptly.auth.cookies import (
    RENEW_AFTER_FRACTION,
    SESSION_TTL_SECONDS,
    TTL_SECONDS,
    CookieSigner,
    cookie_policy,
    should_renew,
)
from aptly.config import Settings


def _settings(env: str) -> Settings:
    return Settings(APTLY_ENV=env)  # type: ignore[call-arg]


# ═══════════════════════════════════════════════════════════════════════════
# The marking that decides whether the cookie is ever sent again
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("env", ["staging", "production"])
def test_a_deployed_cookie_is_marked_for_cross_site_use(env: str) -> None:
    policy = cookie_policy(_settings(env))

    # Lax here means the browser accepts the cookie and then never sends it to
    # the API again, because the API is a different site.
    assert policy["samesite"] == "none"
    # Browsers reject SameSite=None without it, so the two must travel together.
    assert policy["secure"] is True


def test_local_development_stays_on_lax() -> None:
    policy = cookie_policy(_settings("development"))

    # Same-site on a laptop, and Lax is the safer default where it works.
    assert policy["samesite"] == "lax"
    # Secure would drop the cookie entirely over plain http.
    assert policy["secure"] is False


@pytest.mark.parametrize("env", ["development", "staging", "production"])
def test_a_session_cookie_is_never_readable_from_script(env: str) -> None:
    assert cookie_policy(_settings(env))["httponly"] is True


# ═══════════════════════════════════════════════════════════════════════════
# Using the product keeps you signed in
# ═══════════════════════════════════════════════════════════════════════════


def test_a_signed_in_session_outlives_anonymous_work() -> None:
    # They answer different questions: how long we keep work belonging to
    # nobody, versus how long somebody stays signed in.
    assert SESSION_TTL_SECONDS > TTL_SECONDS


def test_a_fresh_cookie_is_not_renewed() -> None:
    assert not should_renew(time.time() + SESSION_TTL_SECONDS, SESSION_TTL_SECONDS)


def test_a_cookie_past_halfway_is_renewed() -> None:
    remaining = SESSION_TTL_SECONDS * RENEW_AFTER_FRACTION - 60
    assert should_renew(time.time() + remaining, SESSION_TTL_SECONDS)


def test_an_expired_cookie_is_past_renewal_too() -> None:
    assert should_renew(time.time() - 1, SESSION_TTL_SECONDS)


def test_renewing_actually_moves_the_expiry_in_the_payload() -> None:
    """The expiry lives in the signed payload, not only in `max-age`.

    Re-sending the same token with a longer `max-age` buys nothing: the browser
    would keep it and the server would go on rejecting it at the original time.
    """
    signer = CookieSigner(_settings("development"))

    short = signer.verify(signer.sign({"sub": "you@example.com"}, 60))
    long = signer.verify(signer.sign({"sub": "you@example.com"}, SESSION_TTL_SECONDS))

    assert short and long
    assert long["exp"] > short["exp"]
