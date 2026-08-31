"""Rate limiting for the anonymous tier.

The design doc's rule is "first win before first signup": a stranger can tailor a
CV with no account. That is the right product call and it is also an open tap on
a paid API, so it needs a cap.

In-memory and per-process on purpose. It is a guardrail for a single instance,
not a distributed quota system; when this runs on more than one machine the
counters belong in Postgres. Until then, a dependency that costs nothing beats a
Redis nobody is paying for.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field

from fastapi import Request

from aptly.config import get_settings
from aptly.errors import RateLimitedError

_DAY = 86_400.0


@dataclass(slots=True)
class _Window:
    """Timestamps of recent calls, per caller."""

    hits: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))

    def record(self, key: str, *, limit: int, window: float) -> int:
        now = time.monotonic()
        bucket = self.hits[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            return -1
        bucket.append(now)
        return limit - len(bucket)

    def sweep(self, window: float) -> None:
        """Drop callers we have not seen inside the window, so this cannot grow
        without bound on a long-running process."""
        now = time.monotonic()
        for key in list(self.hits):
            bucket = self.hits[key]
            while bucket and now - bucket[0] > window:
                bucket.popleft()
            if not bucket:
                del self.hits[key]


_TAILORS = _Window()
_EXTRACTS = _Window()
_AGENT = _Window()
_sweeps = 0


def caller_key(request: Request) -> str:
    """Who is asking.

    Behind a proxy the socket address is the proxy's, so the forwarded header is
    preferred where present. It is spoofable — this is a cost guardrail, not a
    security control, and the daily spend ceiling is the real backstop.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_agent_quota(request: Request) -> int:
    """Consume one agent turn. Returns how many remain today.

    Its own counter, because the shape of the use is different: a conversation
    is several turns in a few minutes where a tailoring is a handful in a day,
    and sharing a budget would mean editing a CV by asking costs the tailorings
    somebody came for.
    """
    global _sweeps

    settings = get_settings()
    limit = settings.agent_turns_per_day
    if limit <= 0:
        return 0

    _sweeps += 1
    if _sweeps % 500 == 0:
        _AGENT.sweep(_DAY)

    remaining = _AGENT.record(caller_key(request), limit=limit, window=_DAY)
    if remaining < 0:
        raise RateLimitedError(
            f"You have used today's {limit} edits by conversation.",
            hint="This resets every 24 hours. Every line is still editable by hand.",
        )
    return remaining


def check_extract_quota(request: Request) -> int:
    """Consume one profile extraction. Returns how many remain today.

    On its own counter rather than sharing the tailoring one. Reading a CV into
    a profile is a different act with a different shape: somebody sets their
    profile up once and revisits it when a job changes, where tailoring is the
    thing they do daily. Sharing a budget would mean an afternoon of tidying a
    profile spends the tailorings they came for.

    It needs *a* limit because it is an LLM call reachable by anyone with an
    account, and a loop that uploads the same CV repeatedly is otherwise a way
    to spend somebody else's money.
    """
    global _sweeps

    settings = get_settings()
    limit = settings.profile_extracts_per_day
    if limit <= 0:
        return 0

    _sweeps += 1
    if _sweeps % 500 == 0:
        _EXTRACTS.sweep(_DAY)

    remaining = _EXTRACTS.record(caller_key(request), limit=limit, window=_DAY)
    if remaining < 0:
        raise RateLimitedError(
            f"You have read {limit} CVs into your profile today.",
            hint="This resets every 24 hours. Your profile is still editable by hand.",
        )
    return remaining


def check_tailor_quota(request: Request) -> int:
    """Consume one anonymous tailoring. Returns how many remain today."""
    global _sweeps

    settings = get_settings()
    limit = settings.anon_tailors_per_day
    if limit <= 0:
        return 0

    _sweeps += 1
    if _sweeps % 500 == 0:
        _TAILORS.sweep(_DAY)

    remaining = _TAILORS.record(caller_key(request), limit=limit, window=_DAY)
    if remaining < 0:
        raise RateLimitedError(
            f"You have used today's {limit} free tailorings.",
            hint="Free tailorings reset every 24 hours.",
        )
    return remaining
