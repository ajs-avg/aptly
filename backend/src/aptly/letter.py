"""The cover letter, written from the person's own material.

Every generator on the internet writes a confident letter by inventing the
middle of it. This one is held to the CV product's rule: every claim traceable
to the person's material, and the details a letter conventionally needs but
their material cannot supply — a hiring manager's name, an office city — are
not guessed. They are left as named blanks the person fills in a small form,
which is faster than proof-reading a page of prose hunting for what a model
made up.

── Placeholders are the honest failure mode ────────────────────────────────

``[[Hiring manager's name]]`` in the text, and the same token listed in
``placeholders`` with a label and a hint. The browser swaps values in as the
person types; no second model call, because substitution is not a writing
task.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.document import CVDocument
from aptly.profile.schemas import CareerProfile
from aptly.validate import SourceMaterial, unsupported_claims

log = get_logger(__name__)

MAX_JOB_POST_CHARS = 60_000


class Placeholder(BaseModel):
    """One detail the letter needs and the material does not have."""

    token: str = Field(description="Exactly as it appears in the letter: [[Hiring manager's name]].")
    label: str = Field(description="Short field label — 'Hiring manager's name'.")
    hint: str = Field(
        default="",
        description="One clause of help: 'On the posting, or use \"Hiring team\".'",
    )


class CoverLetter(BaseModel):
    """The letter, and the blanks it was honest about."""

    letter: str = Field(
        description=(
            "The full letter. Short paragraphs separated by blank lines, under "
            "250 words, no letterhead or date. Unknown details appear as "
            "[[double-bracketed]] tokens, never guessed."
        )
    )
    placeholders: list[Placeholder] = Field(default_factory=list)


LETTER_SYSTEM = """\
You write one cover letter, for one job, from one person's material. Nothing \
else.

# The one rule

**Only write what their material supports.** Their CV, their career profile \
and the job post are in front of you. Every claim about them must be traceable \
to their CV or profile. The job post tells you what to emphasise — it is never \
evidence about them, so a skill that appears only in the advert does not \
appear in the letter.

# Placeholders, never guesses

A letter conventionally wants details their material cannot supply: the hiring \
manager's name, how they found the role. Do not invent them and do not write \
around them awkwardly. Put a [[double-bracketed label]] exactly where the \
detail belongs — [[Hiring manager's name]], [[Where you found this role]] — \
and list every token in `placeholders` with a label and a one-clause hint. \
Two to four placeholders is normal; a letter with none is usually one that \
guessed.

# How you write

Under 250 words, three or four short paragraphs, separated by blank lines. No \
letterhead, no date, no address block. Open with the role and one concrete \
reason they fit, drawn from their strongest evidence for THIS post. The middle \
is specifics — their numbers, their tools, their outcomes, in their register. \
Close with one plain sentence, not a plea.

Never use: spearheaded, leveraged, utilised, orchestrated, championed, \
passionate, results-driven, dynamic, seasoned, synergy, seamless, \
cutting-edge, best-in-class, proven track record, instrumental in, thrilled, \
esteemed organisation, perfect fit.\
"""


def letter_user(
    *,
    document: CVDocument,
    job_text: str,
    profile: CareerProfile | None,
) -> str:
    lines = ["# The job post", "", job_text.strip()[:MAX_JOB_POST_CHARS], ""]
    lines += ["# Their CV", "", document.plain_text(), ""]
    if profile:
        lines += ["# Their career profile", "", profile.as_source_text(), ""]
    lines += ["Write the cover letter."]
    return "\n".join(lines)


async def write_letter(
    document: CVDocument,
    job_text: str,
    *,
    client: GeminiClient,
    profile: CareerProfile | None = None,
) -> tuple[CoverLetter, Usage]:
    """One letter, checked like every other line the product writes."""
    completion = await client.structured(
        model=client.main_model,
        system=LETTER_SYSTEM,
        user=letter_user(document=document, job_text=job_text, profile=profile),
        schema=CoverLetter,
        # A letter is a writing task in a way extraction never is.
        temperature=0.4,
        purpose="letter",
    )
    reply = completion.value

    # The same no-fabrication check as everywhere else, with two allowances a
    # letter legitimately needs: the employer's own name and role (it is
    # addressed to them), and the placeholder tokens (they are blanks, not
    # claims).
    source = SourceMaterial.build(
        document,
        None,
        profile_text=profile.as_source_text() if profile else "",
        extra=_addressee(job_text),
    )
    body = reply.letter
    for placeholder in reply.placeholders:
        body = body.replace(placeholder.token, " ")

    if problem := unsupported_claims(body, source):
        _, detail = problem
        log.info("letter.refused", detail=detail[:200])
        raise LetterUnsupportedError(detail)

    log.info(
        "letter.written",
        words=len(reply.letter.split()),
        placeholders=len(reply.placeholders),
        output_tokens=completion.usage.output_tokens,
    )
    return reply, completion.usage


class LetterUnsupportedError(Exception):
    """The letter claimed something the person never wrote."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def _addressee(job_text: str) -> str:
    """The first lines of the advert — where the company and role are named.

    The whole post must not become source material (that is how an advert's
    wish list gets laundered into somebody's history), but a letter that may
    not name its addressee cannot be written. The opening lines carry the
    name and the title and almost never the requirements.
    """
    return " ".join(job_text.strip().splitlines()[:5])[:400]
