"""Gemini client.

A thin, opinionated wrapper. Everything here exists because of a specific way
this can go wrong:

**Structured or nothing.** Every call declares a Pydantic ``response_schema``, so
a malformed answer fails loudly at the boundary rather than becoming a confusing
bug three layers up.

**Never silently cheaper.** There is no fallback to another model or another key.
Google's free tier states plainly that submitted data is used for training, and
the input here is people's CVs — names, addresses, employment history. A quiet
downgrade would be a privacy incident, so the only failure mode is an error.

**Every call is priced.** The product lets anonymous visitors run the expensive
path before signing up. Each call records its cost, and a daily ceiling stops a
bad afternoon from becoming a bad invoice.

**One SDK, two backends.** ``google-genai`` talks to both the Gemini API and
Vertex AI; only the constructor differs. So the provider is a setting, every
prompt and schema below is shared, and moving to Vertex is a credential change
rather than a second implementation to keep in step.
"""

from __future__ import annotations

import asyncio
import math
import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from aptly.config import Settings, get_settings
from aptly.errors import ConfigurationError, ModelOverloadedError, SpendCeilingError
from aptly.llm.pricing import cost_usd
from aptly.logging import get_logger

log = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

#: Popular Gemini models go through capacity spikes that last tens of seconds,
#: not seconds. Three attempts with 1.5s and 3s between them spend four seconds
#: waiting and then report a failure the user reads as "my CV is broken" — so
#: they re-upload it, and hit the same spike. Five attempts with a doubling
#: backoff waits about thirty seconds, which is long enough to ride out most of
#: them and still short enough to be a wait rather than a hang.
_MAX_ATTEMPTS = 5
_RETRY_BASE_SECONDS = 2.0
_RETRY_CAP_SECONDS = 12.0

#: Failures that are about Google's capacity rather than our request. Matched on
#: the message because the SDK reports several of these as the same error class.
_TRANSIENT_MARKERS = (
    "429",
    "500",
    "502",
    "503",
    "504",
    "unavailable",
    "overloaded",
    "high demand",
    "resource_exhausted",
    "deadline",
    "timeout",
)


def _is_transient(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _TRANSIENT_MARKERS)


#: Capacity, specifically — as opposed to a rate limit we caused, which needs a
#: different answer from the person.
_OVERLOAD_MARKERS = ("503", "unavailable", "overloaded", "high demand")


def _is_overloaded(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _OVERLOAD_MARKERS)


def _rejects_thinking(exc: Exception) -> bool:
    message = str(exc).lower()
    return "thinking" in message or "thought" in message


@dataclass(slots=True)
class Usage:
    """What one call consumed."""

    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    seconds: float


@dataclass(slots=True)
class Completion[T: BaseModel]:
    """A validated result plus what it cost to get."""

    value: T
    usage: Usage


@dataclass(slots=True)
class _Ledger:
    """Today's spend, held in memory.

    Deliberately process-local for now: it is a circuit breaker, not an
    accounting system. ``usage_events`` in Postgres is the durable record. When
    this runs on more than one instance the ceiling wants moving into the
    database, and this comment is the reminder.
    """

    day: date = field(default_factory=lambda: datetime.now(UTC).date())
    spent_usd: float = 0.0

    def add(self, amount: float) -> float:
        today = datetime.now(UTC).date()
        if today != self.day:
            self.day, self.spent_usd = today, 0.0
        self.spent_usd += amount
        return self.spent_usd


_LEDGER = _Ledger()


@dataclass(frozen=True, slots=True)
class FilePart:
    """A document handed to the model as bytes rather than as extracted text."""

    data: bytes
    mime_type: str = "application/pdf"


def _build_client(settings: Settings) -> genai.Client:
    """Construct the SDK client for whichever backend is configured.

    Both paths return the same ``genai.Client``, so nothing downstream branches
    on the provider. The two differ only in how they prove who is calling:
    Vertex uses Application Default Credentials against a Cloud project, the
    Gemini API uses a key.
    """
    if settings.uses_vertex:
        if not settings.google_cloud_project:
            raise ConfigurationError(
                "APTLY_LLM_PROVIDER is 'vertex' but no Google Cloud project is set.",
                hint=(
                    "Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION, and point "
                    "GOOGLE_APPLICATION_CREDENTIALS at a service-account JSON file "
                    "(or run `gcloud auth application-default login`). To go back to "
                    "the Gemini API, set APTLY_LLM_PROVIDER=gemini."
                ),
            )
        return genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )

    if not settings.gemini_api_key:
        raise ConfigurationError(
            "No Gemini API key is configured.",
            hint="Copy .env.example to .env and set GEMINI_API_KEY, then restart the API.",
        )
    return genai.Client(api_key=settings.gemini_api_key)


class GeminiClient:
    """Calls Gemini and returns validated Pydantic objects."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = _build_client(self._settings)

    # ── models ───────────────────────────────────────────────────────────

    @property
    def main_model(self) -> str:
        """For work where quality is the product: tailoring, coaching, prep."""
        return self._settings.gemini_model_main

    @property
    def fast_model(self) -> str:
        """For mechanical extraction and classification."""
        return self._settings.gemini_model_fast

    @property
    def vision_model(self) -> str:
        """For reading a document as pages of pixels rather than as text."""
        return self._settings.resolved_vision_model

    # ── the one call ─────────────────────────────────────────────────────

    async def structured(
        self,
        *,
        model: str,
        system: str,
        user: str,
        schema: type[T],
        temperature: float = 0.3,
        max_output_tokens: int | None = None,
        files: Sequence[FilePart] = (),
        purpose: str = "unspecified",
    ) -> Completion[T]:
        """Run one call and return the parsed, validated result.

        ``files`` attaches raw documents — a PDF read as pages rather than as a
        text stream. They are sent before the prompt so the instructions are the
        last thing the model reads.

        Raises :class:`SpendCeilingError` when today's guardrail is already hit,
        and :class:`ConfigurationError` when the model returns something the
        schema rejects even after a retry.
        """
        self._check_ceiling()

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            thinking_config=self._thinking(),
        )

        contents: object = user
        if files:
            contents = [
                *(
                    types.Part.from_bytes(data=part.data, mime_type=part.mime_type)
                    for part in files
                ),
                user,
            ]

        started = datetime.now(UTC)
        response = await self._with_retries(model=model, user=contents, config=config)
        seconds = (datetime.now(UTC) - started).total_seconds()

        usage = self._record(response, model=model, seconds=seconds, purpose=purpose)
        value = self._parse(response, schema)
        return Completion(value=value, usage=usage)

    def _thinking(self) -> types.ThinkingConfig | None:
        """Cap reasoning tokens, which dominate both latency and cost here.

        Returns None when the operator has asked to leave it to the model. Not
        every model accepts the field, so callers must tolerate it being
        rejected — see :meth:`_with_retries`.
        """
        budget = self._settings.thinking_budget
        if budget < 0:
            return None
        return types.ThinkingConfig(thinking_budget=budget)

    # ── embeddings ───────────────────────────────────────────────────────

    async def embed(
        self,
        texts: Sequence[str],
        *,
        task_type: str = "SEMANTIC_SIMILARITY",
        purpose: str = "embed",
    ) -> list[list[float]]:
        """Embed ``texts``, returning unit-length vectors in the same order.

        Normalising here rather than at each comparison means cosine similarity
        downstream is a plain dot product — which is what makes a pure-Python
        index fast enough to skip a numpy dependency for a few hundred vectors.

        An embedding failure is not fatal to the caller: semantic matching is an
        improvement on literal matching, not a replacement for it, so this
        raises and the analysis falls back rather than the whole run dying.
        """
        if not texts:
            return []
        self._check_ceiling()

        started = datetime.now(UTC)
        response = await self._client.aio.models.embed_content(
            model=self._settings.gemini_model_embed,
            contents=list(texts),
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=self._settings.embed_dimensions,
            ),
        )
        seconds = (datetime.now(UTC) - started).total_seconds()

        vectors = [_unit(list(item.values or [])) for item in (response.embeddings or [])]
        if len(vectors) != len(texts):
            raise ConfigurationError(
                "The embedding model returned a different number of vectors than it was given.",
                hint="Retry. If it persists, the embedding model name may be wrong.",
            )

        log.info(
            "llm.embed",
            purpose=purpose,
            model=self._settings.gemini_model_embed,
            count=len(vectors),
            dimensions=self._settings.embed_dimensions,
            seconds=round(seconds, 2),
        )
        return vectors

    # ── internals ────────────────────────────────────────────────────────

    async def _with_retries(self, *, model: str, user: object, config: object) -> object:
        """Call the model, retrying the failures that pass on their own.

        Popular models are periodically overloaded — the API answers "high
        demand… please try again", and a second later the same request works.
        Without this, a transient blip on Google's side reads to the user as
        "Aptly is broken", on the one screen the whole product rests on.

        Only transient classes are retried. A 400 or a 404 is a bug or a
        misconfigured model name, and repeating it just wastes the person's time.
        """
        delay = _RETRY_BASE_SECONDS
        last: Exception | None = None

        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                return await self._client.aio.models.generate_content(
                    model=model, contents=user, config=config
                )
            except Exception as exc:
                # Not every model accepts a thinking budget, and the ones that
                # do not reject the whole request. Drop the field and continue
                # rather than failing a tailoring run over a tuning knob.
                if _rejects_thinking(exc) and getattr(config, "thinking_config", None):
                    log.info("llm.thinking_unsupported", model=model)
                    config.thinking_config = None  # type: ignore[attr-defined]
                    continue
                if not _is_transient(exc):
                    raise
                if attempt == _MAX_ATTEMPTS:
                    # Say which of the two it was. "Google is busy" and "Aptly
                    # broke" call for completely different things from the
                    # person in front of it, and only one of them is worth them
                    # editing their CV over.
                    if _is_overloaded(exc):
                        log.error("llm.overloaded", model=model, attempts=attempt)
                        raise ModelOverloadedError(
                            "Google's model is busy right now, so Aptly could not finish this run.",
                            hint=(
                                "Nothing is wrong with your CV — this is capacity on "
                                "Google's side. Wait a minute and press the button "
                                "again; your CV and the job post are still here."
                            ),
                        ) from exc
                    raise

                last = exc
                log.warning(
                    "llm.retrying",
                    model=model,
                    attempt=attempt,
                    in_seconds=round(delay, 2),
                    error=str(exc)[:140],
                )
                await asyncio.sleep(delay)
                # Jittered, so a burst of sections retrying does not march back
                # in lockstep and re-create the spike we are waiting out.
                delay = min(delay * 2, _RETRY_CAP_SECONDS) * (0.85 + 0.3 * random.random())

        raise last or RuntimeError("unreachable")

    def _parse(self, response: object, schema: type[T]) -> T:
        """Prefer the SDK's parsed object; fall back to validating the text.

        ``response.parsed`` is None when the model stopped early — a length cap,
        a safety stop — and the raw text is then usually truncated JSON. Saying
        so plainly beats a bare AttributeError.
        """
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, schema):
            return parsed

        text = (getattr(response, "text", None) or "").strip()
        if text:
            try:
                return schema.model_validate_json(text)
            except ValidationError as exc:
                log.warning("llm.schema_rejected", schema=schema.__name__, error=str(exc)[:400])
                raise ConfigurationError(
                    "The model returned a response Aptly could not read.",
                    hint="Try again. If it keeps happening, the model or prompt needs attention.",
                ) from exc

        raise ConfigurationError(
            "The model returned an empty response.",
            hint="This usually means the request was too long. Try a shorter job post.",
        )

    def _record(self, response: object, *, model: str, seconds: float, purpose: str) -> Usage:
        meta = getattr(response, "usage_metadata", None)
        input_tokens = int(getattr(meta, "prompt_token_count", 0) or 0)
        output_tokens = int(getattr(meta, "candidates_token_count", 0) or 0)
        # Thinking tokens are billed as output but reported separately.
        output_tokens += int(getattr(meta, "thoughts_token_count", 0) or 0)

        cost = cost_usd(model, input_tokens=input_tokens, output_tokens=output_tokens)
        total = _LEDGER.add(cost)

        log.info(
            "llm.call",
            purpose=purpose,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 5),
            spent_today_usd=round(total, 4),
            seconds=round(seconds, 2),
        )
        return Usage(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            seconds=seconds,
        )

    def _check_ceiling(self) -> None:
        ceiling = self._settings.daily_spend_ceiling_usd
        if ceiling <= 0 or _LEDGER.spent_usd < ceiling:
            return
        log.error("llm.ceiling_reached", spent_usd=round(_LEDGER.spent_usd, 4), ceiling=ceiling)
        raise SpendCeilingError(
            "Aptly has paused AI features for today.",
            hint="This is a spending guardrail, not a fault. It resets at midnight UTC.",
        )


def spent_today_usd() -> float:
    """Today's LLM spend so far. Surfaced on /ready."""
    return round(_LEDGER.spent_usd, 4)


def _unit(vector: list[float]) -> list[float]:
    """Scale to length 1, so a dot product is a cosine."""
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]
