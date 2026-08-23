"""What happens when Google is out of capacity.

Popular Gemini models go through 503 spikes that last tens of seconds. That is
nobody's fault and it has a specific answer, but reported as the generic "Aptly
could not finish tailoring this CV" it reads as *your file broke this* — so
people re-upload, re-paste and start cutting their CV down trying to fix
something that was never wrong with it.

These pin the two behaviours that keep that from happening: wait long enough to
ride the spike out, and if it does not clear, say what it actually was.
"""

from __future__ import annotations

import asyncio
from itertools import pairwise

import pytest
from aptly.errors import ModelOverloadedError
from aptly.llm import client as llm

OVERLOAD = (
    "503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently "
    "experiencing high demand. Spikes in demand are usually temporary. Please try "
    "again later.', 'status': 'UNAVAILABLE'}}"
)


class _Boom(Exception):
    pass


@pytest.fixture(autouse=True)
def no_real_sleeping(monkeypatch):
    """Run the backoff schedule without actually waiting through it."""
    slept: list[float] = []

    async def record(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(llm.asyncio, "sleep", record)
    return slept


def _client(monkeypatch, attempts: list[int], fail_times: int):
    """A client whose only model call fails `fail_times` and then succeeds."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    from aptly.config import get_settings

    get_settings.cache_clear()
    subject = llm.GeminiClient.__new__(llm.GeminiClient)
    subject._settings = get_settings()

    class _Models:
        async def generate_content(self, **_kwargs):
            attempts.append(1)
            if len(attempts) <= fail_times:
                raise _Boom(OVERLOAD)
            return object()

    class _Aio:
        models = _Models()

    class _Inner:
        aio = _Aio()

    subject._client = _Inner()
    return subject


# ═══════════════════════════════════════════════════════════════════════════


def test_a_spike_that_clears_is_never_seen_by_the_user(monkeypatch, no_real_sleeping) -> None:
    """The common case. Two 503s in a row is normal and should cost nothing but
    a few seconds."""
    attempts: list[int] = []
    subject = _client(monkeypatch, attempts, fail_times=2)

    asyncio.run(subject._with_retries(model="gemini-2.5-flash", user="hi", config=object()))

    assert len(attempts) == 3
    assert len(no_real_sleeping) == 2


def test_it_waits_long_enough_to_be_worth_waiting(monkeypatch, no_real_sleeping) -> None:
    """Three attempts with 1.5s and 3s between them spent four seconds and gave
    up — which is inside the length of a normal spike, so the retry was there
    without helping."""
    attempts: list[int] = []
    subject = _client(monkeypatch, attempts, fail_times=99)

    with pytest.raises(ModelOverloadedError):
        asyncio.run(subject._with_retries(model="gemini-2.5-flash", user="hi", config=object()))

    assert sum(no_real_sleeping) > 20, f"gave up after only {sum(no_real_sleeping):.1f}s"


def test_the_backoff_is_jittered(monkeypatch, no_real_sleeping) -> None:
    """Sections retry in parallel. Identical delays march them back in lockstep
    and re-create the spike they are waiting out."""
    attempts: list[int] = []
    subject = _client(monkeypatch, attempts, fail_times=99)

    with pytest.raises(ModelOverloadedError):
        asyncio.run(subject._with_retries(model="gemini-2.5-flash", user="hi", config=object()))

    # Doubling alone would make every gap an exact multiple of the last.
    ratios = [round(b / a, 3) for a, b in pairwise(no_real_sleeping)]
    assert len(set(ratios)) > 1, f"no jitter in {no_real_sleeping}"


def test_capacity_is_reported_as_capacity(monkeypatch, no_real_sleeping) -> None:
    """The whole point: the person is told this is Google being busy, and told
    their CV is fine — otherwise they go and edit a CV that was never the
    problem."""
    attempts: list[int] = []
    subject = _client(monkeypatch, attempts, fail_times=99)

    with pytest.raises(ModelOverloadedError) as caught:
        asyncio.run(subject._with_retries(model="gemini-2.5-flash", user="hi", config=object()))

    assert "busy" in caught.value.detail.lower()
    assert "nothing is wrong with your cv" in caught.value.hint.lower()


def test_a_real_bug_is_not_retried(monkeypatch, no_real_sleeping) -> None:
    """A 400 or a bad model name is our mistake. Repeating it five times just
    makes the person wait thirty seconds for the same wrong answer."""
    attempts: list[int] = []
    subject = _client(monkeypatch, attempts, fail_times=0)

    class _Models:
        async def generate_content(self, **_kwargs):
            attempts.append(1)
            raise _Boom("404 NOT_FOUND. Model 'gemini-9-ultra' does not exist.")

    subject._client.aio.models = _Models()

    with pytest.raises(_Boom):
        asyncio.run(subject._with_retries(model="gemini-9-ultra", user="hi", config=object()))

    assert len(attempts) == 1
    assert no_real_sleeping == []
