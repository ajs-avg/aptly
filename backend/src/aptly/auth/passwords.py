"""Hashing passwords.

``hashlib.scrypt`` rather than bcrypt or argon2, and that is a deliberate
choice rather than a compromise. scrypt is memory-hard, it is in the standard
library, and it is the one strong option here that adds no dependency — which
matters because a password hash is the last thing that should be waiting on a
wheel to build on a deployment host.

What this must never be is a bare digest. SHA-256 of a password is a GPU's
afternoon; the whole job of the function below is to be slow and memory-hungry
on purpose.

The parameters travel *with* each hash rather than living in a constant. Cost
has to rise as hardware does, and a stored hash that does not say what it cost
to make cannot be verified after the constant moves — so raising it would
either lock everybody out or require a flag day. Written this way, a raised
cost applies to new hashes, old ones keep verifying, and
:func:`needs_rehash` tells the sign-in path when to quietly upgrade one.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from base64 import urlsafe_b64decode, urlsafe_b64encode

#: CPU/memory cost. 2**14 blocks of 128·r bytes ≈ 16 MB and a few tens of
#: milliseconds per hash — enough to make offline guessing expensive, little
#: enough that a sign-in still feels immediate.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
DK_LEN = 32
SALT_BYTES = 16

#: Shortest password accepted. Length is the only rule worth enforcing: the
#: composition rules ("one capital, one symbol") push people towards
#: `Password1!` and measurably weaken what they choose.
MIN_LENGTH = 8

#: Passwords longer than this are refused rather than hashed. scrypt has no
#: length limit, so a megabyte of input is a megabyte of work — one request
#: that pins a core for a second, and a cheap way to make a server unwell.
MAX_LENGTH = 1024


class PasswordError(ValueError):
    """A password that cannot be used, with a reason a person can act on."""


def validate(password: str) -> None:
    """Refuse what should never reach the hasher."""
    if len(password) < MIN_LENGTH:
        raise PasswordError(f"Passwords need at least {MIN_LENGTH} characters.")
    if len(password) > MAX_LENGTH:
        raise PasswordError("That password is too long.")


def hash_password(password: str) -> str:
    """A self-describing hash: algorithm, cost, salt and key in one string."""
    validate(password)
    salt = secrets.token_bytes(SALT_BYTES)
    derived = _derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return "$".join(
        [
            "scrypt",
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            _b64(salt),
            _b64(derived),
        ]
    )


def verify(password: str, stored: str | None) -> bool:
    """Does this password match the stored hash?

    Never raises for a malformed or missing hash — a profile created before
    passwords existed simply has none, and that is a failed sign-in rather than
    a 500. The comparison is constant-time, because a fast "no" and a slow "no"
    are two different answers to somebody measuring.
    """
    if not stored or not password:
        return False
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        derived = _derive(password, _unb64(salt), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(derived, _unb64(expected))


def needs_rehash(stored: str | None) -> bool:
    """Was this hash made with weaker parameters than we use now?

    Sign-in is the only moment the plaintext is in hand, so it is the only
    moment an old hash can be upgraded. Callers re-hash and store.
    """
    if not stored:
        return False
    try:
        scheme, n, r, p, _, _ = stored.split("$")
    except ValueError:
        return True
    return scheme != "scrypt" or int(n) < SCRYPT_N or int(r) < SCRYPT_R or int(p) < SCRYPT_P


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=n,
        r=r,
        p=p,
        dklen=DK_LEN,
        # scrypt's memory use is roughly 128·N·r; OpenSSL refuses beyond its own
        # default ceiling unless told the budget, and the default is below what
        # N = 2**14 needs.
        maxmem=256 * n * r,
    )


def _b64(data: bytes) -> str:
    return urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(data: str) -> bytes:
    return urlsafe_b64decode(data + "=" * (-len(data) % 4))
