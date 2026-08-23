"""Redesign — change the shape of the CV, not just its sentences.

This is the half of the product that Suggest mode structurally could not do.
Suggest can say "replace the text of this line"; it has no way to say "this
section is in the wrong place" or "these bullets are in the wrong order", which
is why its output always looked like small edits however good the model was.

The division of labour between the two is worth keeping clear:

- **Redesign** decides *where things go and what to leave out*. Its schema is
  made only of permutations and hides, so it cannot invent — see
  :mod:`aptly.redesign.schemas`.
- **Rewriting** still happens through the existing suggestion path, which
  requires provenance and passes eight validation layers.

Running both is what the user chose when they picked "redesign for this job":
the structure moves first, then the wording of what survived is tailored. Doing
it in that order matters — rewriting a bullet and then dropping it is wasted
work and wasted money.
"""

from __future__ import annotations

from aptly.analyse.schemas import Analysis
from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.document import CVDocument
from aptly.redesign.ops import Redesigned, Removed, apply_plan
from aptly.redesign.prompts import REDESIGN_SYSTEM, redesign_user
from aptly.redesign.schemas import PlannedRedesign, RedesignPlan
from aptly.redesign.validate import check

log = get_logger(__name__)


async def plan_redesign(
    document: CVDocument,
    analysis: Analysis,
    *,
    client: GeminiClient,
) -> tuple[PlannedRedesign, Usage]:
    """Ask for a restructure, then check every operation before returning it."""
    result = await client.structured(
        model=client.main_model,
        system=REDESIGN_SYSTEM,
        user=redesign_user(document=document, analysis=analysis),
        schema=RedesignPlan,
        # Structural judgement, not prose. A little variation helps it consider
        # an ordering it would not have reached first; more just makes it
        # restless, and a restless redesign moves things for the sake of it.
        temperature=0.3,
        purpose="redesign_plan",
    )

    planned = check(result.value, document)
    log.info(
        "redesign.planned",
        proposed=len(result.value.operations),
        kept=len(planned.operations),
        rejected=len(planned.rejections),
        drops=planned.drops,
    )
    return planned, result.usage


__all__ = [
    "PlannedRedesign",
    "Redesigned",
    "Removed",
    "apply_plan",
    "check",
    "plan_redesign",
]
