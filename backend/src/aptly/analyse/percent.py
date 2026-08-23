"""Turning a fraction into the percentage a person sees.

Its own module because two languages compute this number — Python here, and
TypeScript in the browser so the figure can move while somebody edits — and they
have to agree exactly.

They did not. Python's ``round`` breaks ties to even, so ``round(12.5)`` is 12;
JavaScript's ``Math.round`` breaks ties upward, so it is 13. One requirement
half-answered out of four lands precisely on that tie, and the browser showed
13% while the server said 12% for the same CV. A one-point gap is worse than a
large one: it is small enough to look like a rounding bug and big enough to make
somebody wonder which number to believe.

Half-up wins because it is what people expect of a percentage, and because it is
the behaviour that was already on screen.
"""

from __future__ import annotations

import math


def percent(earned: float, total: int) -> int:
    """``earned`` out of ``total`` as a whole percentage, ties rounded up."""
    if total <= 0:
        return 0
    return math.floor(100 * earned / total + 0.5)
