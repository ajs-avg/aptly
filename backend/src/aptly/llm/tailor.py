"""The tailoring run.

Orchestrates one pass over a CV against one job post, and streams results as
they arrive rather than making the person wait for the whole thing.

**It reads before it writes.** Every run begins with an analysis pass: the job
read for what it selects on, the whole CV read against it, and a gap map. This
is the fix for the complaint that the tool only noticed small things — it did,
and it had to, because each section used to be rewritten by a call that had
never seen the rest of the document. A pass with no view of the whole can tighten
a sentence and nothing more.

**Two modes, and the difference is structural, not a slider.**

- ``suggest`` proposes edits to individual lines. Nothing moves, nothing goes.
- ``redesign`` first restructures — reorders sections, reorders bullets inside
  the most relevant job, leaves out what is not earning its space — and then
  tailors the wording of whatever survived.

The order there is load-bearing. Rewriting a bullet and then dropping it is
wasted latency and wasted money, and it shows the person a change card for a
line that is about to disappear.

**Sections still run in parallel.** Each section is its own model call, which
keeps each prompt short — making a hallucinated node id much less likely — and
means the first change card appears while the rest of the document is still
being worked on.

**Rejections are counted, not hidden.** When the validator drops a suggestion or
the structural check refuses an operation, that fact is reported. The product's
promise is that nothing reaches the user unless it can be traced to something
they wrote; showing the count is how that promise becomes visible rather than a
claim in a footer.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal

from aptly.analyse import analyse as run_analysis
from aptly.analyse import build_gap_map, coverage_from, judge_against
from aptly.analyse.schemas import Analysis
from aptly.analyse.scoring import ScoreCard, build_scorecard
from aptly.llm.client import GeminiClient, Usage
from aptly.llm.prompts import TAILOR_SYSTEM, tailor_user
from aptly.llm.schemas import Coverage, JobPost, Suggestion, SuggestionBatch
from aptly.logging import get_logger
from aptly.model.document import CVDocument, Section
from aptly.pitch import build_pitch
from aptly.pitch.schemas import PitchCard
from aptly.profile.schemas import CareerProfile
from aptly.rebuild import rebuild_cv
from aptly.redesign import apply_plan, plan_redesign
from aptly.redesign.describe import describe
from aptly.redesign.schemas import PlannedRedesign, RestructureOp
from aptly.validate import Flag, SourceMaterial, validate

log = get_logger(__name__)

#: ``both`` is the mode the two-CV screen uses: one run, one analysis, two
#: finished documents. Running the two paths as separate requests would parse
#: the job and read the CV twice — the two slowest calls in the product, for an
#: answer that would be identical both times.
Mode = Literal["suggest", "redesign", "both"]

#: Sections whose prose the tailoring pass can meaningfully improve. Education
#: and contact details are facts; rewriting them is out of scope by design.
TAILORABLE = frozenset({"summary", "experience", "projects", "skills", "custom", "volunteering"})

#: How many section calls run at once. Enough to feel immediate, low enough to
#: stay well inside per-minute request limits on a fresh API key.
MAX_CONCURRENCY = 4


# ═══════════════════════════════════════════════════════════════════════════
# Events
# ═══════════════════════════════════════════════════════════════════════════


@dataclass(slots=True)
class JobParsed:
    kind: Literal["job"] = field(default="job", init=False)
    job: JobPost = field(default_factory=JobPost)


@dataclass(slots=True)
class Analysed:
    """The whole reading, before anything is proposed."""

    analysis: Analysis
    #: Everything needed to re-score the CV in the browser without another model
    #: call, so the match figure moves while the person edits rather than
    #: appearing once and going stale.
    scorecard: ScoreCard
    #: Sent here as well as on `done`, because it is knowable *now* — it is
    #: derived from the gap map, which this event already carries. Holding it
    #: back until the run ends meant the score appeared a minute before the
    #: sentence explaining it, which is the half people actually need.
    fit: str
    kind: Literal["analysis"] = field(default="analysis", init=False)


@dataclass(slots=True)
class CoverageReady:
    coverage: Coverage
    kind: Literal["coverage"] = field(default="coverage", init=False)


@dataclass(slots=True)
class StructureChange:
    """One structural operation, ready to become a card the user can undo."""

    operation: RestructureOp
    summary: str
    reason: str
    kind: Literal["structure"] = field(default="structure", init=False)


@dataclass(slots=True)
class RedesignReady:
    """The restructure is settled; what follows is wording."""

    intent: str
    applied: int
    rejected: int
    #: Section and line ids left out of this version, so the UI can offer them
    #: back. Nothing is destroyed — the browser still holds the original.
    removed: list[dict[str, str]]
    kind: Literal["redesign"] = field(default="redesign", init=False)


@dataclass(slots=True)
class Rebuilt:
    """The second CV: written from scratch rather than edited."""

    document: CVDocument
    approach: str
    #: How the freshly-written document scores against the same job. Recomputed
    #: rather than assumed — the whole claim of the second CV is that it answers
    #: the post better, and a number nobody checked is not evidence of that.
    match: int
    fit: str
    #: Lines the model wrote that did not survive checking, with their reasons.
    #: Reported rather than hidden: a rebuild that silently discards a third of
    #: its output while announcing success is the dishonest version of this.
    dropped: list[dict[str, str]]
    #: Per-requirement status on the rebuilt CV, so the screen can show which
    #: requirements the rewrite actually won — and which it lost. A single
    #: percentage moving is not evidence of anything on its own.
    per_requirement: dict[str, str]
    kind: Literal["rebuilt"] = field(default="rebuilt", init=False)


@dataclass(slots=True)
class Pitch:
    """What to say on the call, for one of the two CVs."""

    #: "tailored" or "rebuilt" — which document this prepares them for.
    document: str
    card: PitchCard
    kind: Literal["pitch"] = field(default="pitch", init=False)


@dataclass(slots=True)
class Change:
    """One validated suggestion, ready to become a change card."""

    suggestion: Suggestion
    section_id: str
    section_title: str
    flags: tuple[Flag, ...] = ()
    kind: Literal["suggestion"] = field(default="suggestion", init=False)


@dataclass(slots=True)
class SectionDone:
    section_id: str
    accepted: int
    rejected: int
    kind: Literal["section_done"] = field(default="section_done", init=False)


#: What the run actually concluded. Separate from the suggestion count because
#: the count alone is ambiguous in the one case that matters most.
Outcome = Literal["improved", "already_strong", "cannot_help"]


@dataclass(slots=True)
class RunDone:
    accepted: int
    rejected: int
    #: Why suggestions were dropped, by reason. Shown to the user as evidence
    #: that the no-fabrication rule is doing something.
    rejections: dict[str, int]
    cost_usd: float
    seconds: float
    #: How close the CV was to the job before any changes.
    fit: str = "workable"
    #: The run's conclusion, stated rather than left to be inferred.
    #:
    #: Zero suggestions means two opposite things — "this CV is already right for
    #: the job" and "nothing in this CV can be made to fit" — and the screen
    #: showed both as *nothing worth changing*. A pastry chef applying for a data
    #: engineering role was told their CV was perfect. Deciding it here means the
    #: UI never has to guess, and never guesses wrong in the direction that costs
    #: somebody an application.
    outcome: Outcome = "improved"
    kind: Literal["done"] = field(default="done", init=False)


@dataclass(slots=True)
class RunFailed:
    message: str
    hint: str
    kind: Literal["error"] = field(default="error", init=False)


TailorEvent = (
    JobParsed
    | Analysed
    | CoverageReady
    | StructureChange
    | RedesignReady
    | Rebuilt
    | Pitch
    | Change
    | SectionDone
    | RunDone
    | RunFailed
)


# ═══════════════════════════════════════════════════════════════════════════
# The run
# ═══════════════════════════════════════════════════════════════════════════


async def tailor(
    document: CVDocument,
    job_text: str,
    *,
    client: GeminiClient,
    stories: dict[str, str] | None = None,
    profile: CareerProfile | None = None,
    mode: Mode = "suggest",
) -> AsyncIterator[TailorEvent]:
    """Stream the tailoring of ``document`` against ``job_text``."""
    started = asyncio.get_running_loop().time()
    spend: list[Usage] = []

    analysis, analysis_usage = await run_analysis(document, job_text, client=client)
    spend.extend(analysis_usage)

    yield JobParsed(job=analysis.job.post)
    yield Analysed(
        analysis=analysis,
        scorecard=build_scorecard(analysis.job, analysis.gaps),
        fit=analysis.fit,
    )
    yield CoverageReady(coverage=coverage_from(analysis.gaps))

    working = document
    if mode in {"redesign", "both"}:
        planned, plan_usage = await plan_redesign(document, analysis, client=client)
        spend.append(plan_usage)

        for operation in planned.operations:
            yield StructureChange(
                operation=operation,
                summary=describe(operation, document),
                reason=getattr(operation, "reason", ""),
            )

        result = apply_plan(document, planned.operations)
        working = result.document
        yield RedesignReady(
            intent=planned.intent,
            applied=len(planned.operations),
            rejected=len(planned.rejections),
            removed=[
                {"kind": item.kind, "id": item.id, "label": item.label, "reason": item.reason}
                for item in result.removed
            ],
        )
        _log_plan(planned, result.removed)

    # The second CV is written from scratch while the first is still having its
    # wording tailored. They share nothing but the analysis, so serialising them
    # would just add one call's latency to a screen that already waits.
    second = (
        asyncio.create_task(_compose_second(document, analysis, client, profile, stories, spend))
        if mode == "both"
        else None
    )

    tally = _Tally()
    async for event in _rewrite(working, analysis, client, stories, profile, spend, tally):
        yield event

    if second is not None:
        for event in await second:
            yield event

    if mode == "both":
        card, usage = await build_pitch(working, analysis, client=client, label="tailored")
        spend.append(usage)
        yield Pitch(document="tailored", card=card)

    fit = analysis.fit
    yield RunDone(
        accepted=tally.accepted,
        rejected=tally.rejected,
        rejections=dict(tally.reasons),
        cost_usd=round(sum(u.cost_usd for u in spend), 5),
        seconds=round(asyncio.get_running_loop().time() - started, 2),
        fit=fit,
        outcome=_outcome(tally.accepted, fit),
    )


async def _compose_second(
    document: CVDocument,
    analysis: Analysis,
    client: GeminiClient,
    profile: CareerProfile | None,
    stories: dict[str, str] | None,
    spend: list[Usage],
) -> list[TailorEvent]:
    """Write the freely-rebuilt CV, score it, and prepare its call notes."""
    try:
        result, rebuilt, usage = await rebuild_cv(
            document, analysis, client=client, profile=profile, stories=stories
        )
        spend.append(usage)

        # Judged on its own, not on the original's answers. Those cite lines by
        # quote, and a rebuild rewrites every line — so carrying them over
        # failed every citation and marked the second CV down for doing exactly
        # what it was asked to do.
        evidence, judge_usage = await judge_against(rebuilt, analysis.job, client=client)
        spend.append(judge_usage)
        gaps = await build_gap_map(rebuilt, analysis.job, client=client, evidence=evidence)
        scored = analysis.model_copy(update={"gaps": gaps})

        events: list[TailorEvent] = [
            Rebuilt(
                document=rebuilt,
                approach=result.approach,
                match=gaps.score,
                fit=scored.fit,
                dropped=[
                    {"text": item.text, "reason": item.reason, "detail": item.detail}
                    for item in result.dropped
                ],
                per_requirement={gap.requirement: gap.status for gap in gaps.gaps},
            )
        ]

        card, pitch_usage = await build_pitch(rebuilt, scored, client=client, label="rebuilt")
        spend.append(pitch_usage)
        events.append(Pitch(document="rebuilt", card=card))
        return events
    except Exception as exc:
        # The rebuilt CV is the second of two answers. Losing it should not cost
        # the person the first one, which is already on their screen.
        log.warning("tailor.rebuild_failed", error=str(exc)[:300])
        return []


async def _rewrite(
    document: CVDocument,
    analysis: Analysis,
    client: GeminiClient,
    stories: dict[str, str] | None,
    profile: CareerProfile | None,
    spend: list[Usage],
    tally: _Tally,
) -> AsyncIterator[TailorEvent]:
    """Tailor the wording of every section, in parallel, streaming as they land.

    Counts into ``tally`` rather than closing the run itself: in ``both`` mode
    the second CV is still being written when the last section lands, and the
    run is not over until it arrives.
    """
    source = SourceMaterial.build(
        document, stories, profile_text=profile.as_source_text() if profile else ""
    )
    sections = [s for s in document.sections if s.kind in TAILORABLE and _editable(s)]

    queue: asyncio.Queue[TailorEvent | None] = asyncio.Queue()
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    job = analysis.job.post

    async def run_section(section: Section) -> None:
        async with semaphore:
            accepted = rejected = 0
            try:
                result = await client.structured(
                    model=client.main_model,
                    system=TAILOR_SYSTEM,
                    user=tailor_user(
                        section=section,
                        job=job,
                        job_text="",
                        editable=[n for n in section.nodes if n.editable],
                        stories=[{"id": k, "text": v} for k, v in (stories or {}).items()],
                        analysis=analysis,
                    ),
                    schema=SuggestionBatch,
                    temperature=0.4,
                    purpose=f"tailor:{section.kind}",
                )
                spend.append(result.usage)
                # Logged even when zero. A section that quietly returns nothing
                # is indistinguishable from one that was never asked, and that
                # ambiguity cost a long time to diagnose once already.
                log.info(
                    "tailor.section",
                    section=section.kind,
                    editable_nodes=sum(1 for n in section.nodes if n.editable),
                    returned=len(result.value.suggestions),
                    output_tokens=result.usage.output_tokens,
                )

                for suggestion in result.value.suggestions:
                    verdict = validate(suggestion, document=document, source=source, job=job)
                    if not verdict.ok:
                        rejected += 1
                        reason = verdict.rejection or "unknown"
                        tally.reasons[reason] = tally.reasons.get(reason, 0) + 1
                        log.info(
                            "tailor.rejected",
                            reason=reason,
                            detail=verdict.detail,
                            node_id=suggestion.node_id,
                        )
                        continue
                    accepted += 1
                    await queue.put(
                        Change(
                            suggestion=suggestion,
                            section_id=section.id,
                            section_title=section.title or section.kind.title(),
                            flags=verdict.flags,
                        )
                    )
            except Exception as exc:
                log.warning("tailor.section_failed", section=section.kind, error=str(exc)[:200])

            tally.accepted += accepted
            tally.rejected += rejected
            await queue.put(
                SectionDone(section_id=section.id, accepted=accepted, rejected=rejected)
            )

    async def drive() -> None:
        await asyncio.gather(
            *(run_section(section) for section in sections), return_exceptions=True
        )
        await queue.put(None)

    driver = asyncio.create_task(drive())
    try:
        while (event := await queue.get()) is not None:
            yield event
    finally:
        await driver


def _outcome(accepted: int, fit: str) -> Outcome:
    """What to tell the person when the run produced nothing.

    Silence from the tailoring pass is not praise. When the CV genuinely does
    not fit the job there is nothing true to surface, and saying "nothing worth
    changing" reads as "you are ready to send this" — which is how a pastry
    chef's CV was reported as perfect for a data engineering role.
    """
    if accepted:
        return "improved"
    return "cannot_help" if fit in {"weak", "mismatch"} else "already_strong"


@dataclass(slots=True)
class _Tally:
    """Running counts for the whole run, owned by :func:`tailor`."""

    accepted: int = 0
    rejected: int = 0
    reasons: dict[str, int] = field(default_factory=dict)


def _editable(section: Section) -> bool:
    return any(node.editable for node in section.nodes)


def _log_plan(planned: PlannedRedesign, removed: list) -> None:
    log.info(
        "tailor.redesigned",
        operations=len(planned.operations),
        rejected=len(planned.rejections),
        removed=len(removed),
        reasons=[rejection.reason for rejection in planned.rejections],
    )
