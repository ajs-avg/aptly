"""What the call-preparation pass returns.

Two fields carry the weight. ``why_you_fit`` requires evidence, so a talking
point is always something the recruiter can see on the page in front of them.
``gaps_to_own`` is required to be honest, and is the field every rival tool
leaves out: the person is going to be asked about what they cannot do, and
having a prepared, non-defensive answer is worth more than a longer list of
strengths.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class FitPoint(BaseModel):
    """One reason they fit, and the line on the CV that shows it."""

    claim: str = Field(description="One sentence they could say out loud. Plain, not salesy.")
    evidence: str = Field(
        description=(
            "The exact words from their CV that back it up, quoted. Checked "
            "against the document afterwards — a point that cannot be seen on "
            "the page is dropped."
        )
    )


class Gap(BaseModel):
    """Something the post asked for that they cannot claim."""

    requirement: str
    honest_answer: str = Field(
        description=(
            "What to actually say when asked. Never a deflection and never a "
            "stretch — name the gap, then the nearest real thing they have "
            "done, then what they would need. People are hired with gaps every "
            "day; they are not hired after being caught covering one."
        )
    )


class PitchCard(BaseModel):
    """Everything needed for a first call about this application."""

    one_liner: str = Field(
        default="",
        description=(
            "How they should answer 'tell me about yourself' for THIS role, in "
            "two sentences. Their real background, pointed at this job."
        ),
    )
    why_you_fit: list[FitPoint] = Field(
        default_factory=list, description="Three to five, strongest first."
    )
    talking_points: list[str] = Field(
        default_factory=list,
        description="Specifics worth raising unprompted — a number, a system, a decision.",
    )
    gaps_to_own: list[Gap] = Field(
        default_factory=list,
        description="Every essential requirement they do not meet. Do not soften the list.",
    )
    likely_questions: list[str] = Field(
        default_factory=list,
        description="What a screener would ask given this CV and this post.",
    )
    ask_them: list[str] = Field(
        default_factory=list,
        description="Two or three questions worth asking back, drawn from the post itself.",
    )
