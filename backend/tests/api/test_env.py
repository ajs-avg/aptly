"""What each environment name means.

`APTLY_ENV` decides two different things, and an early version answered both
with one flag. That forced a bad trade on the first real deployment: name it
`production` and the app refuses to start, because production requires Supabase
Auth and there was none; name it `development` and it hands out session cookies
without the Secure flag, over HTTPS, on the public internet.

`staging` is the missing answer — deployed, but not production yet.
"""

from __future__ import annotations

import pytest
from aptly.auth import LocalAuth
from aptly.config import Settings
from aptly.errors import ConfigurationError


def _settings(env: str) -> Settings:
    return Settings(APTLY_ENV=env)  # type: ignore[call-arg]


@pytest.mark.parametrize("env", ["development", "test", "staging", "production"])
def test_every_documented_environment_is_accepted(env: str) -> None:
    """A value the deploy config tells people to use, that the app then
    rejects at import, is a crash loop with a clear cause and no clear fix."""
    assert _settings(env).env == env


def test_an_unknown_environment_is_refused_at_startup() -> None:
    with pytest.raises(ValueError):
        _settings("prod")


@pytest.mark.parametrize(
    ("env", "deployed"),
    [("development", False), ("test", False), ("staging", True), ("production", True)],
)
def test_cookies_are_secure_anywhere_that_is_not_a_laptop(env: str, deployed: bool) -> None:
    """The Secure flag follows *being deployed*, not *being production*. A
    staging deploy is still HTTPS on the public internet."""
    assert _settings(env).is_deployed is deployed


@pytest.mark.parametrize(
    ("env", "production"),
    [("development", False), ("test", False), ("staging", False), ("production", True)],
)
def test_real_auth_is_required_only_in_production(env: str, production: bool) -> None:
    assert _settings(env).is_production is production


def test_the_development_sign_in_still_works_in_staging() -> None:
    """Staging has no Supabase, so this is the only provider it has. If it
    refused here too there would be no environment a first deploy could use."""
    assert LocalAuth(_settings("staging")) is not None


def test_the_development_sign_in_still_refuses_production() -> None:
    """Email-only with no password. It must never be what guards real data."""
    with pytest.raises(ConfigurationError):
        LocalAuth(_settings("production"))


# ═══════════════════════════════════════════════════════════════════════════
# CORS origins, as people actually paste them
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    ("pasted", "expected"),
    [
        # The value as documentation shows it, with the placeholder brackets
        # left in and a scheme typed in front of one that was already there.
        ("https://<https://aptly.vercel.app/>", ["https://aptly.vercel.app"]),
        ("<https://aptly.vercel.app>", ["https://aptly.vercel.app"]),
        ("https://aptly.vercel.app/", ["https://aptly.vercel.app"]),
        # Render hands one service's address to another without a scheme.
        ("aptly.vercel.app", ["https://aptly.vercel.app"]),
        ("localhost:3000", ["http://localhost:3000"]),
        (
            "https://aptly.vercel.app, http://localhost:3000",
            ["https://aptly.vercel.app", "http://localhost:3000"],
        ),
    ],
)
def test_a_mistyped_origin_is_cleaned_rather_than_failing_silently(
    pasted: str, expected: list[str]
) -> None:
    """A wrong origin here is invisible from both ends.

    The browser cannot tell a refused preflight from an unreachable server —
    both arrive as a bare network error — and the server sees a request it
    never had to answer. So the value is repaired where it can be, and logged
    at startup where it cannot.
    """
    assert Settings(CORS_ORIGINS=pasted).cors_origin_list == expected  # type: ignore[call-arg]
