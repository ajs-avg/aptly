"""Accounts: creating one, signing in, and getting back in.

This path used to be a stand-in — an email and nothing else, so knowing an
address was the same as owning the account. It is a real credential now, and
these are the properties that make it one.
"""

from __future__ import annotations

import pytest
from aptly.auth import passwords
from aptly.config import Settings

GOOD = "a-good-long-passphrase"


def _up(client, email="aman@example.com", name="Aman Mishra", password=GOOD):
    return client.post(
        "/api/auth/sign-up", json={"name": name, "email": email, "password": password}
    )


def _in(client, email="aman@example.com", password=GOOD):
    return client.post("/api/auth/sign-in", json={"email": email, "password": password})


# ═══════════════════════════════════════════════════════════════════════════
# The hash
# ═══════════════════════════════════════════════════════════════════════════


def test_the_same_password_hashes_differently_every_time() -> None:
    """Salted. Two people who choose the same password must not be visibly
    the same in the database, and a stolen table must not be one lookup."""
    assert passwords.hash_password(GOOD) != passwords.hash_password(GOOD)


def test_a_hash_carries_its_own_cost() -> None:
    """So the cost can be raised later without invalidating what is stored."""
    scheme, n, r, p, salt, _ = passwords.hash_password(GOOD).split("$")

    assert scheme == "scrypt"
    assert (int(n), int(r), int(p)) == (
        passwords.SCRYPT_N,
        passwords.SCRYPT_R,
        passwords.SCRYPT_P,
    )
    assert salt


def test_a_weaker_hash_is_marked_for_upgrade() -> None:
    weak = "scrypt$1024$8$1$c2FsdA$aGFzaA"

    assert passwords.needs_rehash(weak)
    assert not passwords.needs_rehash(passwords.hash_password(GOOD))


@pytest.mark.parametrize("stored", [None, "", "not-a-hash", "scrypt$only$three"])
def test_a_missing_or_broken_hash_is_a_refusal_not_a_crash(stored) -> None:
    """A profile from before passwords existed has none. That is a failed
    sign-in, not a 500."""
    assert passwords.verify(GOOD, stored) is False


def test_the_password_itself_is_never_stored(client) -> None:
    _up(client)
    stored = passwords.hash_password(GOOD)

    assert GOOD not in stored


# ═══════════════════════════════════════════════════════════════════════════
# Signing up
# ═══════════════════════════════════════════════════════════════════════════


def test_signing_up_asks_for_a_name_and_uses_it(client) -> None:
    body = _up(client).json()

    # Otherwise everyone is greeted by the first half of their email address.
    assert body["name"] == "Aman Mishra"
    assert body["signed_in"] is True
    assert client.get("/api/auth/session").json()["name"] == "Aman Mishra"


def test_an_address_cannot_have_two_accounts(client) -> None:
    _up(client)
    client.post("/api/auth/sign-out")

    response = _up(client, name="Someone Else", password="a-different-passphrase")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "account_exists"


def test_a_short_password_is_refused(client) -> None:
    response = _up(client, password="short")

    assert response.status_code == 422
    assert "8" in response.json()["error"]["message"]


def test_signing_up_does_not_take_over_an_existing_account(client) -> None:
    """The 409 has to come before the password is written, or "sign up" is a
    way to overwrite somebody's credential with your own."""
    _up(client)
    client.post("/api/auth/sign-out")
    _up(client, password="an-attackers-passphrase")

    assert _in(client, password="an-attackers-passphrase").status_code == 401
    assert _in(client).status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Signing in
# ═══════════════════════════════════════════════════════════════════════════


def test_the_right_password_signs_you_in(client) -> None:
    _up(client)
    client.post("/api/auth/sign-out")

    assert _in(client).status_code == 200
    assert client.get("/api/auth/session").json()["signed_in"] is True


def test_the_wrong_password_does_not(client) -> None:
    _up(client)
    client.post("/api/auth/sign-out")

    assert _in(client, password="wrong-but-long-enough").status_code == 401
    assert client.get("/api/auth/session").json()["signed_in"] is False


def test_an_unknown_address_and_a_wrong_password_answer_identically(client) -> None:
    """Telling them apart tells a stranger which addresses are registered."""
    _up(client)
    client.post("/api/auth/sign-out")

    wrong = _in(client, password="wrong-but-long-enough").json()["error"]
    unknown = _in(client, email="nobody@example.com").json()["error"]

    assert wrong == unknown


# ═══════════════════════════════════════════════════════════════════════════
# Forgetting it
# ═══════════════════════════════════════════════════════════════════════════


def test_a_reset_replaces_the_password(client) -> None:
    _up(client)
    client.post("/api/auth/sign-out")

    reset = client.post(
        "/api/auth/reset-password",
        json={"email": "aman@example.com", "password": "second-passphrase-here"},
    )

    assert reset.status_code == 200
    client.post("/api/auth/sign-out")
    assert _in(client).status_code == 401, "the old password must stop working"
    assert _in(client, password="second-passphrase-here").status_code == 200


def test_a_reset_needs_an_account_to_reset(client) -> None:
    response = client.post(
        "/api/auth/reset-password",
        json={"email": "nobody@example.com", "password": "long-enough-here"},
    )

    assert response.status_code == 404


def test_a_reset_will_not_accept_a_weak_password(client) -> None:
    _up(client)

    response = client.post(
        "/api/auth/reset-password",
        json={"email": "aman@example.com", "password": "short"},
    )

    assert response.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════
# Where the reset is allowed at all
#
# Without the emailed step, "forgot password" is "take over any account whose
# address you can guess". It exists so the flow can be demonstrated, and the
# only thing keeping it out of production is this switch.
# ═══════════════════════════════════════════════════════════════════════════


def test_production_refuses_a_reset_without_the_email_step() -> None:
    assert Settings(APTLY_ENV="production").allow_direct_password_reset is False


@pytest.mark.parametrize("env", ["development", "staging"])
def test_everywhere_else_allows_it_so_the_flow_can_be_shown(env: str) -> None:
    assert Settings(APTLY_ENV=env).allow_direct_password_reset is True


def test_the_switch_can_be_set_either_way_deliberately() -> None:
    locked = Settings(APTLY_ENV="staging", APTLY_ALLOW_DIRECT_PASSWORD_RESET="false")
    opened = Settings(APTLY_ENV="production", APTLY_ALLOW_DIRECT_PASSWORD_RESET="true")

    assert locked.allow_direct_password_reset is False
    assert opened.allow_direct_password_reset is True


def test_the_session_says_whether_a_reset_is_offered(client) -> None:
    """The UI reads this rather than assuming. Offering a reset the server will
    refuse is worse than not offering one."""
    assert client.get("/api/auth/session").json()["direct_reset"] is True
