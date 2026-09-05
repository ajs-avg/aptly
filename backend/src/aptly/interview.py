"""Interview preparation, from the frozen advert and the CV that was sent.

The Library's promise is being ready when they call; this is being ready when
they *schedule*. Both halves of the material are already saved — the advert as
it was on the day, and the exact document that went — so the questions can be
the real ones: what the post demands, what the CV invites, and where the two
do not meet.

The honesty rule holds here with a twist. Answer points come only from the
person's material — a prep sheet that scripts claims they cannot back up is a
rehearsal for getting caught. But a *gap* question is answered with advice
rather than claims, because "how do I handle the Kubernetes question" has an
honest answer that is not "pretend".
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger

log = get_logger(__name__)


class InterviewQuestion(BaseModel):
    """One question they are likely to ask, and how to stand in it."""

    question: str = Field(description="As an interviewer would actually say it.")
    kind: Literal["requirement", "cv", "gap"] = Field(
        description=(
            "requirement: asked because the post demands it. cv: asked because "
            "their CV invites it — a figure or claim to be probed. gap: asked "
            "where the post wants what the material does not show."
        )
    )
    why: str = Field(
        description="One sentence: what in the post or the CV makes this question likely."
    )
    answer_points: list[str] = Field(
        description=(
            "Two to four bullet points to answer from. For requirement and cv "
            "questions: only what their material states — quote their own "
            "figures and outcomes. For gap questions: honest handling advice — "
            "acknowledge, name the nearest real experience, say how they would "
            "close it. Never script a claim their material does not back."
        )
    )


class InterviewPrep(BaseModel):
    """The sheet, ten minutes before the call."""

    questions: list[InterviewQuestion] = Field(
        description="Eight to ten, hardest-hitting first within each kind."
    )
    opener: str = Field(
        description=(
            "Two sentences they can open 'tell me about yourself' with, built "
            "from their strongest evidence for THIS post."
        )
    )


INTERVIEW_SYSTEM = """\
You prepare one person for one interview, from two documents: the job post as \
it was, and the CV they actually sent.

# The one rule

Answer points draw only on what their CV states. Quote their figures, their \
outcomes, their tools. Never script a claim the CV does not back — a prep \
sheet that rehearses an invention is a rehearsal for getting caught in the \
first ten minutes.

# The three kinds of question

- **requirement** — the post demands it, so it will be asked. Point the answer \
at the CV's nearest evidence.
- **cv** — their own CV invites it. Every figure invites "how?", every \
outcome invites "what was your part?". These are the questions people are \
least ready for, so probe the CV the way a sceptical interviewer would.
- **gap** — the post wants what the CV does not show. Do not pretend \
otherwise. The answer points are handling advice: concede it plainly, name \
the nearest real experience, say how they would close the distance. An \
interviewer respects a clean concession and remembers a dodge.

Eight to ten questions across the three kinds, phrased as an interviewer \
would say them. Plain words, no praise, no filler.\
"""


def interview_user(job_text: str, cv_text: str) -> str:
    return "\n".join(
        [
            "# The job post, as it was",
            "",
            job_text.strip()[:60_000],
            "",
            "# The CV they sent",
            "",
            cv_text.strip(),
            "",
            "Write the preparation sheet.",
        ]
    )


async def prepare_interview(
    job_text: str, cv_text: str, *, client: GeminiClient
) -> tuple[InterviewPrep, Usage]:
    completion = await client.structured(
        model=client.main_model,
        system=INTERVIEW_SYSTEM,
        user=interview_user(job_text, cv_text),
        schema=InterviewPrep,
        temperature=0.3,
        purpose="interview",
    )
    prep = completion.value
    log.info(
        "interview.prepared",
        questions=len(prep.questions),
        output_tokens=completion.usage.output_tokens,
    )
    return prep, completion.usage
