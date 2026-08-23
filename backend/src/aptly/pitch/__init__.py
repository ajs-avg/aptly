"""What to say when they call.

The design doc's central scene is a recruiter ringing five weeks after an
application, with the job post taken down and the applicant unable to remember
which CV they sent. This is the half of that screen which is about the
conversation rather than the paperwork: why this person fits, in their own
evidence, and — the part every other tool omits — what they cannot claim.

It runs against a *finished* CV rather than the uploaded one, because the two
documents a run produces make different cases and each deserves its own. The
match figure beside it is computed, not written: it comes from the gap map, so
the talking points and the percentage can never disagree.

The honesty rule here is the same one as everywhere else, and it matters more,
not less: a talking point the person cannot back up is one they will be asked
about in the first ten minutes.
"""

from __future__ import annotations

from aptly.analyse.schemas import Analysis
from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.document import CVDocument
from aptly.pitch.prompts import PITCH_SYSTEM, pitch_user
from aptly.pitch.schemas import PitchCard

log = get_logger(__name__)


async def build_pitch(
    document: CVDocument,
    analysis: Analysis,
    *,
    client: GeminiClient,
    label: str = "cv",
) -> tuple[PitchCard, Usage]:
    """Write the call preparation for one finished CV."""
    completion = await client.structured(
        model=client.main_model,
        system=PITCH_SYSTEM,
        user=pitch_user(document=document, analysis=analysis),
        schema=PitchCard,
        temperature=0.3,
        purpose=f"pitch:{label}",
    )
    card = _drop_unquotable(completion.value, document)

    log.info(
        "pitch.built",
        label=label,
        fit_points=len(card.why_you_fit),
        gaps=len(card.gaps_to_own),
        questions=len(card.likely_questions),
    )
    return card, completion.usage


def _drop_unquotable(card: PitchCard, document: CVDocument) -> PitchCard:
    """Remove any fit claim whose evidence is not on the CV being sent.

    A talking point is a promise the person makes on a phone call. One drawn
    from a line that ended up in the *other* version of their CV is a promise
    the recruiter cannot see them keeping, which is worse than saying nothing.
    """
    haystack = document.plain_text().lower()
    kept = []
    for point in card.why_you_fit:
        evidence = point.evidence.strip().lower()
        if evidence and evidence[:40] not in haystack:
            log.info("pitch.unquotable_point", claim=point.claim[:70])
            continue
        kept.append(point)
    card.why_you_fit = kept
    return card


__all__ = ["PitchCard", "build_pitch"]
