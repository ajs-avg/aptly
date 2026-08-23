"""What a model call costs.

Every call is priced and recorded. Not for accounting — for survival. The
product's whole activation story is "try it before you sign up", which means
anonymous strangers spend real money on every visit. You cannot rate-limit what
you do not measure.

Prices are US dollars per million tokens, checked against Google's published
pricing in August 2026. They move; ``PROMO_ENDS`` marks the one we know expires.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

#: Gemini 3.x Flash carries promotional pricing until this date, after which
#: input and output both double. Budgeting on the promo rate would understate
#: running costs from January, so :func:`price_for` charges the standard rate
#: once the date passes.
PROMO_ENDS = date(2026, 12, 31)


@dataclass(frozen=True, slots=True)
class ModelPrice:
    """Dollars per million tokens."""

    input_usd: float
    output_usd: float
    #: Rates that apply once the introductory period ends, when one exists.
    standard_input_usd: float | None = None
    standard_output_usd: float | None = None

    def current(self, on: date) -> tuple[float, float]:
        if self.standard_input_usd is not None and on > PROMO_ENDS:
            return self.standard_input_usd, self.standard_output_usd or self.output_usd
        return self.input_usd, self.output_usd


PRICES: dict[str, ModelPrice] = {
    # The tailoring pass, the Recruiter-Ready Card, the Gap Coach — anything
    # where quality is the product.
    "gemini-3.7-flash": ModelPrice(0.75, 3.75, standard_input_usd=1.50, standard_output_usd=7.50),
    "gemini-3.6-flash": ModelPrice(0.75, 3.75, standard_input_usd=1.50, standard_output_usd=7.50),
    # Extraction and classification, where the work is mechanical.
    "gemini-3.5-flash-lite": ModelPrice(0.30, 2.50),
    "gemini-3.1-flash-lite": ModelPrice(0.25, 1.50),
    "gemini-3.5-flash": ModelPrice(1.50, 9.00),
    # The 2.5 generation. Materially cheaper than 3.x and still strong at
    # structured extraction, which makes it a reasonable default while the
    # product is finding its footing.
    "gemini-2.5-pro": ModelPrice(1.25, 10.00),
    "gemini-2.5-flash": ModelPrice(0.30, 2.50),
    "gemini-2.5-flash-lite": ModelPrice(0.10, 0.40),
}

#: Charged when we meet a model we have no price for. Deliberately pessimistic:
#: an unknown model should look expensive in the ledger, not free.
_UNKNOWN = ModelPrice(2.00, 12.00)


def price_for(model: str, *, on: date | None = None) -> tuple[float, float]:
    """Input and output dollars per million tokens for ``model`` today."""
    return PRICES.get(model, _UNKNOWN).current(on or date.today())


def cost_usd(model: str, *, input_tokens: int, output_tokens: int, on: date | None = None) -> float:
    """Dollar cost of a single call."""
    rate_in, rate_out = price_for(model, on=on)
    return (input_tokens * rate_in + output_tokens * rate_out) / 1_000_000
