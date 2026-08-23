"""Structured output contracts for every model call.

These are handed to Gemini as ``response_schema``, so the model cannot return
prose where we expect data. Two fields carry unusual weight:

``Suggestion.before``
    Must quote the node's current text verbatim. It is checked against the
    document before anything is shown, which is what makes Apply safe when the
    user has edited the line in the meantime.

``Suggestion.provenance``
    Required, not optional. Every rewrite has to name the CV line or Story Bank
    item it drew from, and quote it. A suggestion that cannot cite its source is
    rejected before the user ever sees it — this is the mechanism behind the
    product's no-fabrication promise, not a nicety.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]


# ═══════════════════════════════════════════════════════════════════════════
# Job post
# ═══════════════════════════════════════════════════════════════════════════


class Requirement(BaseModel):
    """One thing the employer asked for."""

    text: str = Field(description="The requirement, in the job post's own words.")
    keywords: list[str] = Field(
        default_factory=list,
        description=(
            "The specific terms a reader or ATS would look for, e.g. 'Kubernetes'. "
            "Write each one with the capitalisation the product itself uses — "
            "'Airflow', 'dbt', 'BigQuery' — because that is how a name is told "
            "apart from a description."
        ),
    )
    keywords_match: Literal["any", "all"] = Field(
        default="any",
        description=(
            "How the keywords combine. 'any' when the post lists alternatives — "
            "'Snowflake, BigQuery or Redshift', 'Airflow or another orchestrator'. "
            "'all' when it genuinely wants every one of them together — "
            "'Python and SQL', 'Docker and Kubernetes'. Most lists are 'any'."
        ),
    )
    essential: bool = Field(
        default=True,
        description="True if listed as required or essential; False for nice-to-have.",
    )


class JobPost(BaseModel):
    """A job post, read into structure.

    Kept deliberately close to what the post literally says. Anything inferred
    beyond the text would end up on the Recruiter-Ready Card weeks later, where
    the user has no way to check it.
    """

    company: str | None = Field(default=None, description="Hiring company, if stated.")
    role: str | None = Field(default=None, description="Job title as advertised.")
    location: str | None = Field(default=None, description="Location or remote policy.")
    seniority: str | None = Field(default=None, description="e.g. Senior, Lead, Graduate.")
    employment_type: str | None = Field(default=None, description="e.g. Full-time, Contract.")
    salary_text: str | None = Field(
        default=None, description="Salary exactly as written, or null if absent. Never estimated."
    )
    requirements: list[Requirement] = Field(
        default_factory=list, description="What the employer asks for, essential first."
    )
    responsibilities: list[str] = Field(
        default_factory=list, description="What the person would actually do."
    )
    keywords: list[str] = Field(
        default_factory=list,
        description="The terms that matter most for this role, ranked by importance.",
    )


# ═══════════════════════════════════════════════════════════════════════════
# Tailoring
# ═══════════════════════════════════════════════════════════════════════════


class Provenance(BaseModel):
    """Where the content of a rewrite came from. Required on every suggestion."""

    kind: Literal["cv_node", "story_item"] = Field(
        description="Whether the supporting evidence is an existing CV line or a Story Bank item."
    )
    source_id: str = Field(description="The id of that CV node or story item.")
    quote: str = Field(
        description="The exact sentence from that source which supports the rewrite."
    )


class Suggestion(BaseModel):
    """One proposed change to one line of the CV."""

    node_id: str = Field(
        description="The id of the CV node to rewrite. Must be one you were given."
    )
    before: str = Field(
        description="The node's current text, quoted exactly, character for character."
    )
    after: str = Field(description="The proposed replacement text.")
    reason: str = Field(
        description=(
            "One plain sentence saying why this helps for THIS job, naming the "
            "requirement it addresses. No filler, no praise."
        )
    )
    provenance: Provenance = Field(
        description="The source this rewrite is grounded in. Never invent one."
    )
    confidence: Confidence = Field(description="How sure you are this is an improvement.")
    requires_confirmation: bool = Field(
        default=False,
        description=(
            "True if the user must verify something before sending — for example a "
            "figure you carried across from another line."
        ),
    )


class SuggestionBatch(BaseModel):
    """The model's suggestions for one section of the CV."""

    suggestions: list[Suggestion] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Coverage
# ═══════════════════════════════════════════════════════════════════════════


class KeywordMatch(BaseModel):
    """Whether one job term is genuinely present in the CV."""

    keyword: str
    covered: bool
    #: Where it appears, when it does. Lets the UI point at the evidence rather
    #: than asking the user to trust a number.
    evidence_node_id: str | None = None
    evidence_quote: str | None = None


class Coverage(BaseModel):
    """The keyword coverage meter.

    Counts real coverage, including honest synonyms — "K8s" covers
    "Kubernetes". It does not reward stuffing, and the UI never suggests
    inserting a term the person cannot back up.
    """

    matches: list[KeywordMatch] = Field(default_factory=list)

    @property
    def covered(self) -> list[KeywordMatch]:
        return [m for m in self.matches if m.covered]

    @property
    def missing(self) -> list[KeywordMatch]:
        return [m for m in self.matches if not m.covered]

    @property
    def score(self) -> int:
        """Percentage of the job's key terms the CV already carries."""
        if not self.matches:
            return 0
        return round(100 * len(self.covered) / len(self.matches))
