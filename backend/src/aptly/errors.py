"""Application errors.

The design doc's voice rule (p.9): *"errors say what happened and how to fix it,
calmly."* So every error carries a `hint` — the next action the person can take —
not just a status code.
"""

from __future__ import annotations


class AptlyError(Exception):
    """Base class for errors we deliberately surface to the client."""

    status_code: int = 400
    code: str = "aptly_error"

    def __init__(self, detail: str, hint: str = "") -> None:
        self.detail = detail
        self.hint = hint
        super().__init__(detail)


class UnsupportedFormatError(AptlyError):
    status_code = 415
    code = "unsupported_format"


class FileTooLargeError(AptlyError):
    status_code = 413
    code = "file_too_large"


class ParseError(AptlyError):
    status_code = 422
    code = "parse_failed"


class StaleAnchorError(AptlyError):
    """A suggestion pointed at CV text that has since changed."""

    status_code = 409
    code = "stale_anchor"


class RateLimitedError(AptlyError):
    status_code = 429
    code = "rate_limited"


class SpendCeilingError(AptlyError):
    """The daily LLM spend guardrail tripped."""

    status_code = 503
    code = "spend_ceiling_reached"


class ModelOverloadedError(AptlyError):
    """Google is out of capacity for this model right now.

    Its own class because it is the one failure that is nobody's fault and has a
    specific answer. Reported as the generic "Aptly could not finish tailoring
    this CV", it reads as *your file broke this* — so people re-upload, re-paste
    and re-cut their CV trying to fix something that was never wrong with it.
    """

    status_code = 503
    code = "model_overloaded"


class ConfigurationError(AptlyError):
    status_code = 500
    code = "misconfigured"
