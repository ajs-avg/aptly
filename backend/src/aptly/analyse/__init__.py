"""The analysis pass: read the job, read the CV, measure the distance.

This runs before any rewriting, and its existence is the answer to a specific
complaint — that the tool only ever noticed small things. It did, and it had to:
each section was rewritten by a call that had never seen the rest of the
document. A pass with no view of the whole can tighten a sentence and nothing
more. It cannot notice that the most relevant job is third on the page, that a
section is dead weight for this application, or that the strongest evidence the
person has is the fourth clause of a bullet on page two.

Two model calls, and a gap map assembled from three different readers.

1. **Read the job** — what it says, and what it is actually selecting on.
2. **Read the CV against it** — the whole document in one call, which also
   answers the capability questions the next stage cannot settle by itself.
3. **Measure the gap** — no call of its own.

Stage 3 is the interesting one, because it is where this was wrong twice. It
began as a model asking itself whether each keyword was covered, which under-
reported badly: a CV that plainly matched a post scored 2/11 because it used
different words for the same work. Replacing that with pure embedding similarity
over-reported far worse — a frontend CV scored **100%** against a data-
engineering role, matching "Kafka" to a list of React libraries.

So each requirement is now settled by whichever reader can actually settle it:
a literal lookup for named products, the model's judgement (with a checked
citation) for capabilities, and similarity only ever as a pointer at a line
worth reading. See :func:`build_gap_map`.

The embedding round-trip is started before the CV call and awaited after it, so
it costs no wall-clock at all.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from aptly.analyse.embed import Match, build_index, embed_queries
from aptly.analyse.prompts import (
    CV_ANALYSIS_SYSTEM,
    JOB_ANALYSIS_SYSTEM,
    cv_analysis_user,
    job_analysis_user,
)
from aptly.analyse.schemas import (
    Analysis,
    CVAnalysis,
    Gap,
    GapMap,
    JobAnalysis,
    RequirementEvidence,
)
from aptly.analyse.terms import found_in, is_hard_name, mentions
from aptly.llm.client import GeminiClient, Usage
from aptly.llm.schemas import Coverage, KeywordMatch
from aptly.logging import get_logger
from aptly.model.document import CVDocument, normalize_text

log = get_logger(__name__)

#: Node roles worth comparing against a requirement. Section titles and contact
#: details match everything weakly and nothing usefully.
_COMPARABLE = frozenset({"summary", "bullet", "skill_line", "freeform", "entry_role", "entry_org"})


async def analyse_job(job_text: str, *, client: GeminiClient) -> tuple[JobAnalysis, Usage]:
    """Read the advert for what it says and what it selects on."""
    result = await client.structured(
        model=client.main_model,
        system=JOB_ANALYSIS_SYSTEM,
        user=job_analysis_user(job_text),
        schema=JobAnalysis,
        temperature=0.1,
        purpose="analyse_job",
    )
    log.info(
        "analyse.job",
        role=result.value.post.role,
        requirements=len(result.value.post.requirements),
        keywords=len(result.value.post.keywords),
    )
    return result.value, result.usage


async def analyse_cv(
    document: CVDocument,
    job: JobAnalysis,
    *,
    client: GeminiClient,
    judge: list[str] | None = None,
) -> tuple[CVAnalysis, Usage]:
    """Read the whole CV once, against this job.

    ``judge`` rides along: the capability requirements that cannot be settled by
    looking a word up. This call already holds the entire document, which is
    exactly the context that question needs, so answering them here costs
    nothing beyond a few output tokens.
    """
    result = await client.structured(
        model=client.main_model,
        system=CV_ANALYSIS_SYSTEM,
        user=cv_analysis_user(document=document, job=job, judge=judge),
        schema=CVAnalysis,
        temperature=0.2,
        purpose="analyse_cv",
    )
    analysis = _drop_unknown_ids(result.value, document)
    log.info(
        "analyse.cv",
        sections=len(analysis.sections),
        buried=len(analysis.buried),
        noise=sum(1 for s in analysis.sections if s.relevance == "noise"),
        judged=len(analysis.evidence),
    )
    return analysis, result.usage


async def build_gap_map(
    document: CVDocument,
    job: JobAnalysis,
    *,
    client: GeminiClient,
    evidence: list[RequirementEvidence] | None = None,
) -> GapMap:
    """Score every requirement against the CV.

    Three readers, each used only where it is trustworthy:

    - **Literal**, for requirements naming a product (Kafka, dbt, a CFA). A
      named technology is a fact about someone's history, so similarity gets no
      vote on it — letting it vote is exactly how an earlier version scored a
      frontend CV at 100% against a data-engineering post.
    - **The model**, for capability requirements, via ``evidence`` gathered on
      the CV-analysis call. Each answer must cite and quote a line, and the
      citation is checked here before it counts.
    - **Similarity**, as the fallback and as a pointer. It may raise a
      requirement to partial and never to covered.

    Embedding failure degrades to the first two rather than taking the run down
    with it: a coarser coverage number is recoverable, a failed run is not.
    """
    requirements = _requirements_of(job)
    if not requirements:
        return GapMap(gaps=[], semantic=True)

    matches, semantic = await _semantic_matches(document, requirements, client=client)
    return _assemble(document, requirements, matches, semantic, evidence or [])


def capability_requirements(document: CVDocument, job: JobAnalysis) -> list[str]:
    """The requirements worth asking the model about.

    Everything a literal lookup cannot settle, *plus* the named ones the CV
    does not satisfy. The second group used to be excluded, on the reasoning
    that a named product is a fact rather than a judgement — true, but it meant
    a requirement was never even shown to the model once it contained a product
    name, however much else it described.

    Asking costs nothing extra: these travel on the CV-analysis call that
    already runs. And the answer cannot promote a named requirement to covered
    — only to partial, and only with a citation that survives checking.
    """
    haystack = document.plain_text()
    out: list[str] = []
    for item in _requirements_of(job):
        verdict = _literal_verdict(haystack, document, item)
        if not verdict.named or verdict.as_gap().status == "missing":
            out.append(item.text)
    return out


async def analyse(
    document: CVDocument, job_text: str, *, client: GeminiClient
) -> tuple[Analysis, list[Usage]]:
    """The whole reading.

    The job first, because everything else is relative to it. Then the CV read
    and the embedding index concurrently — the index needs only the job's
    requirement texts, which exist by then — so the second stage costs one call's
    latency rather than two.
    """
    job, job_usage = await analyse_job(job_text, client=client)
    requirements = _requirements_of(job)
    # Through the shared function, not a second copy of its rule. The two had
    # already drifted: this one still excluded every named requirement, so
    # widening what gets judged had no effect on the path that actually runs.
    to_judge = capability_requirements(document, job)

    # Started before the CV read and awaited after it. The index depends only on
    # the requirement texts, so the embedding round-trip hides entirely inside
    # the model call rather than adding to it.
    embedding = asyncio.create_task(_semantic_matches(document, requirements, client=client))
    try:
        cv, cv_usage = await analyse_cv(document, job, client=client, judge=to_judge)
    except BaseException:
        embedding.cancel()
        raise
    matches, semantic = await embedding

    gaps = _assemble(document, requirements, matches, semantic, cv.evidence)
    return Analysis(job=job, cv=cv, gaps=gaps), [job_usage, cv_usage]


# ═══════════════════════════════════════════════════════════════════════════
# Internals
# ═══════════════════════════════════════════════════════════════════════════


async def _semantic_matches(
    document: CVDocument,
    requirements: list[_Requirement],
    *,
    client: GeminiClient,
) -> tuple[list[Match | None], bool]:
    """Closest CV line per requirement, or an empty reading if embedding fails."""
    comparable = [
        (node.id, node.text)
        for node in document.nodes
        if node.role in _COMPARABLE and node.text.strip()
    ]
    try:
        index, queries = await asyncio.gather(
            build_index(comparable, client=client, purpose="index_cv"),
            embed_queries([item.text for item in requirements], client=client, purpose="index_job"),
        )
    except Exception as exc:
        log.warning("analyse.embeddings_failed", error=str(exc)[:200])
        return [None] * len(requirements), False

    return [index.best(query) for query in queries], True


def _assemble(
    document: CVDocument,
    requirements: list[_Requirement],
    matches: list[Match | None],
    semantic: bool,
    evidence: list[RequirementEvidence],
) -> GapMap:
    """Combine the three readings into one verdict per requirement."""
    haystack = document.plain_text()
    verdicts = [_literal_verdict(haystack, document, item) for item in requirements]
    judged = _checked_evidence(evidence, document)

    gaps = [
        verdict.refined_by(match, judged.get(_key(verdict.requirement.text)))
        for verdict, match in zip(verdicts, matches, strict=True)
    ]

    log.info(
        "analyse.gaps",
        total=len(gaps),
        covered=sum(1 for g in gaps if g.status == "covered"),
        partial=sum(1 for g in gaps if g.status == "partial"),
        named=sum(1 for v in verdicts if v.named),
        judged=len(judged),
        semantic=semantic,
    )
    return GapMap(gaps=gaps, semantic=semantic)


def _key(text: str) -> str:
    return normalize_text(text).lower()


def _checked_evidence(
    evidence: list[RequirementEvidence], document: CVDocument
) -> dict[str, RequirementEvidence]:
    """Keep only the answers whose citation survives being checked.

    The model is asked to name a line and quote it. A "covered" whose quote is
    nowhere in the document is dropped rather than shown — the same rule the
    tailoring validator applies to a rewrite, for the same reason: a claim about
    somebody's CV that cannot be traced back to their own words is not a finding,
    it is a guess with a citation stapled on.

    **Checked by quote, not by node id.** The id is used when it still resolves,
    because it locates the evidence exactly. But the same evidence is re-checked
    against *derived* documents — the freshly-written CV is scored with the
    answers gathered from the original — and a rebuild assigns its own ids to
    every line. Requiring the id to match meant every judged requirement was
    quietly downgraded on the rebuilt CV, which could then only score on the
    literal terms it is forbidden from inventing. Both versions came out at the
    person's original figure, and the second panel had nothing to say for itself.

    The question the check has to answer is "does this document still show
    this?", and that is about the words, not about where they are filed.
    """
    haystack = normalize_text(document.plain_text()).lower()

    kept: dict[str, RequirementEvidence] = {}
    for item in evidence:
        key = _key(item.requirement)
        if not key:
            continue
        if not item.covered:
            kept[key] = item
            continue

        quote = normalize_text(item.quote or "").lower()
        if not quote or quote not in haystack:
            log.info(
                "analyse.evidence_unverified",
                requirement=item.requirement[:80],
                node_id=item.node_id,
            )
            kept[key] = item.model_copy(update={"covered": False, "node_id": None, "quote": None})
            continue

        # Re-point at whichever line carries it now, so the UI can still show
        # the reader where the evidence sits in *this* version.
        node = document.node(item.node_id) if item.node_id else None
        if node is None or quote not in normalize_text(node.text).lower():
            node = next(
                (n for n in document.nodes if quote in normalize_text(n.text).lower()),
                None,
            )
        kept[key] = item.model_copy(update={"node_id": node.id if node else None})
    return kept


@dataclass(slots=True)
class _Requirement:
    """One thing to score, with the specific terms it names."""

    text: str
    essential: bool
    keywords: list[str]
    #: Whether the keywords are alternatives ("Snowflake, BigQuery or Redshift")
    #: or a set the employer wants together ("Python and SQL"). Read from the
    #: post rather than guessed: treating an "or" list as an "and" list marked a
    #: data engineer who had Airflow, dbt, Kafka, Snowflake and Terraform as
    #: only *partly* qualified, because each requirement also named an
    #: alternative they happened not to use.
    combine: str = "any"


@dataclass(slots=True)
class _Verdict:
    """What the literal pass could establish on its own."""

    requirement: _Requirement
    #: True when this requirement names specific things that can be looked up.
    #: When it does, the literal answer is the real answer.
    named: bool
    present: list[str]
    absent: list[str]
    node_id: str | None = None
    quote: str | None = None

    def as_gap(self, similarity: float = 0.0) -> Gap:
        """The verdict with no help from embeddings."""
        if not self.named or not self.present:
            status = "missing"
        elif self.requirement.combine == "any" or not self.absent:
            # Alternatives: naming one of them answers the requirement.
            status = "covered"
        else:
            status = "partial"

        return Gap(
            requirement=self.requirement.text,
            essential=self.requirement.essential,
            status=status,
            evidence_node_id=self.node_id,
            evidence_quote=self.quote,
            similarity=round(similarity, 4),
            literal=bool(self.present),
        )

    def refined_by(self, match: Match | None, judged: RequirementEvidence | None = None) -> Gap:
        """Fold in whatever the other two readers were able to establish.

        Precedence is by reliability, not by cost:

        1. **The literal check**, for requirements that name a product. It cannot
           produce a false positive, so nothing may overrule it.
        2. **The model's judgement**, for capability requirements — but only when
           its citation survives checking against the document.
        3. **Similarity**, which may raise a requirement to *partial* and never
           to *covered*. On labelled data it separated true from false at 82%,
           with real overlap between the two, so it is a pointer at a line worth
           reading rather than a verdict.
        """
        score = match.score if match else 0.0
        gap = self.as_gap(score)

        if self.named:
            # A named technology the CV does not name is never *covered*. A CV
            # that does not say Kafka may have used Kinesis, and no amount of
            # reading around it makes that Kafka — this is the rule the
            # 100%-coverage bug existed for want of.
            #
            # But "missing" was too strong. Requirements are rarely a bare
            # product name: "Strong SQL, including window functions" contains
            # one, so the whole requirement was settled by searching for the
            # word "SQL" — and a CV reading "wrote complex queries against
            # PostgreSQL" was scored as not having it. Every reader would
            # disagree, which is most of why a CV a person calls a 90% match was
            # coming out in the sixties.
            #
            # So a *cited* judgement can raise it to partial. It has to name a
            # line and quote it, and the quote is verified against the document
            # before it counts, so this is evidence rather than an opinion — it
            # simply is not proof of the specific product.
            if gap.status == "missing":
                if judged is not None and judged.covered and judged.node_id:
                    gap.status = "partial"
                    gap.evidence_node_id, gap.evidence_quote = judged.node_id, judged.quote
                elif match and match.suggestive:
                    gap.status = "partial"
                    gap.evidence_node_id, gap.evidence_quote = match.id, match.text
            return gap

        if judged is not None and judged.covered:
            gap.status = "covered"
            gap.evidence_node_id, gap.evidence_quote = judged.node_id, judged.quote
            return gap

        if match and match.suggestive:
            gap.status = "partial"
            gap.evidence_node_id, gap.evidence_quote = match.id, match.text
        return gap


def _requirements_of(job: JobAnalysis) -> list[_Requirement]:
    """What to score, de-duplicated, requirements before bare keywords.

    Keywords are scored too, because an applicant tracking system scans for them
    literally — but one already named inside a requirement adds nothing except a
    second row saying the same thing.
    """
    seen: set[str] = set()
    out: list[_Requirement] = []

    for requirement in job.post.requirements:
        key = normalize_text(requirement.text).lower()
        if key and key not in seen:
            seen.add(key)
            out.append(
                _Requirement(
                    text=requirement.text.strip(),
                    essential=requirement.essential,
                    keywords=list(requirement.keywords),
                    combine=requirement.keywords_match,
                )
            )

    for keyword in job.post.keywords:
        key = normalize_text(keyword).lower()
        if not key or key in seen or any(key in existing for existing in seen):
            continue
        seen.add(key)
        # A bare keyword is its own name to look up — and it is *not* a
        # must-have. A job post's keyword list is where "Agile", "Git" and
        # "communication" live: signals a reader scans for, not conditions of
        # being considered. Marking them essential put a dozen of them beside
        # the handful of things the employer actually requires, and every one
        # they happened not to name dragged the score down as hard as a missing
        # degree.
        out.append(_Requirement(text=keyword.strip(), essential=False, keywords=[keyword.strip()]))

    return out


def _literal_verdict(haystack: str, document: CVDocument, requirement: _Requirement) -> _Verdict:
    """Which of the products this requirement names does the CV actually name?

    Only *hard* names take this path — the proper nouns. A requirement whose
    keywords are all descriptions ("data engineering", "window functions") has
    nothing to look up and is handed to the semantic pass instead, which is the
    difference between recognising a data engineer's CV and rejecting it because
    the post wrote "engineering" and the CV wrote "engineer".
    """
    candidates = [term for term in requirement.keywords if is_hard_name(term)]
    # A bare requirement with no keywords of its own is often a name already —
    # "dbt in production", "Kafka".
    if not candidates and is_hard_name(requirement.text):
        candidates = [requirement.text]

    present, absent = found_in(haystack, candidates)
    if not present and not absent:
        return _Verdict(requirement=requirement, named=False, present=[], absent=[])

    node_id = quote = None
    if present:
        found = _node_naming(document, present[0])
        if found is not None:
            node_id, quote = found

    return _Verdict(
        requirement=requirement,
        named=True,
        present=present,
        absent=absent,
        node_id=node_id,
        quote=quote,
    )


def _node_naming(document: CVDocument, term: str) -> tuple[str, str] | None:
    """The line where a term appears, preferring evidence over a skills list.

    A term in a skills line is a claim; the same term inside a description of
    work is proof. Both count as covered, but the second is the better thing to
    show the person, so experience is searched first.
    """
    nodes = [n for n in document.nodes if n.role in _COMPARABLE and n.text.strip()]
    for role_group in (
        ("bullet", "summary", "freeform"),
        ("skill_line", "entry_role", "entry_org"),
    ):
        for node in nodes:
            if node.role in role_group and mentions(node.text, term):
                return node.id, node.text
    return None


def _drop_unknown_ids(analysis: CVAnalysis, document: CVDocument) -> CVAnalysis:
    """Discard assessments and node references that name nothing real.

    A hallucinated id is not a small error here: the redesign planner acts on
    these, and acting on an id that does not exist either crashes or silently
    does nothing. Better to lose one assessment than to carry a phantom.
    """
    sections = {section.id for section in document.sections}
    nodes = {node.id for node in document.nodes}

    kept = []
    for assessment in analysis.sections:
        if assessment.section_id not in sections:
            log.info("analyse.unknown_section_id", section_id=assessment.section_id)
            continue
        assessment.strongest_node_ids = [n for n in assessment.strongest_node_ids if n in nodes]
        assessment.weakest_node_ids = [n for n in assessment.weakest_node_ids if n in nodes]
        kept.append(assessment)

    analysis.sections = kept
    return analysis


def coverage_from(gaps: GapMap) -> Coverage:
    """Render the gap map in the shape the existing coverage meter expects.

    Keeps one wire format for the UI while the thing behind it changed from a
    model call to a measurement.
    """
    return Coverage(
        matches=[
            KeywordMatch(
                keyword=gap.requirement,
                covered=gap.status == "covered",
                evidence_node_id=gap.evidence_node_id,
                evidence_quote=gap.evidence_quote,
            )
            for gap in gaps.gaps
        ]
    )


__all__ = [
    "Analysis",
    "analyse",
    "analyse_cv",
    "analyse_job",
    "build_gap_map",
    "capability_requirements",
    "coverage_from",
]
