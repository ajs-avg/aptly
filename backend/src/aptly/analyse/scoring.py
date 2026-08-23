"""Scoring a CV against a job while somebody is still typing in it.

The match figure is only useful if it moves. A number that appears once and then
sits there while the person applies six changes tells them nothing about whether
any of it worked — and the whole point of showing the CV and the score together
is to make the connection between an edit and its effect visible.

So the score has to update on every keystroke, which rules out asking a model.
An embedding call per character is neither affordable nor fast enough, and it
would make the number jitter for reasons the person cannot see.

The way out is to notice that a requirement is settled by one of two very
different things:

**Naming something.** "Airflow", "dbt", "Snowflake". Whether the CV names it is
a text question with a certain answer, it changes the moment a line is edited,
and it is cheap enough to answer thousands of times a second.

**Judging something.** "Strong SQL, including window functions", "three years in
a data engineering role". These were settled by a model reading the whole CV,
they are claims about the *person* rather than about the current wording, and
rewording a bullet does not change the answer.

This module turns a finished analysis into a **scorecard**: the naming
requirements with their terms already resolved to aliases, and the judged ones
with their verdicts frozen. Evaluating it is pure text matching, so the browser
can do it live and the server can do it authoritatively, from the same data.

Two rules keep the two evaluators honest:

1. All the hard thinking — which terms count, what their aliases are, whether a
   phrase is a name at all — happens *here*, once. The client receives resolved
   alias lists and does nothing but look for them.
2. :func:`evaluate` below is the reference implementation. The browser's copy
   must produce the same answer for the same inputs, and there is a test that
   pins the behaviour it has to match.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from aptly.analyse.percent import percent
from aptly.analyse.schemas import GapMap, GapStatus, JobAnalysis
from aptly.analyse.terms import aliases_of, canonical, is_hard_name, is_nameable, names_any
from aptly.model.document import normalize_text

Combine = Literal["any", "all"]


class TermGroup(BaseModel):
    """One thing to look for, and every name it goes by.

    Aliases are resolved on the server precisely so the client never has to
    know that "K8s" and "Kubernetes" are the same thing. That knowledge lives in
    one table, and shipping the resolved list means it cannot fall out of step
    with a second copy.
    """

    #: What to call it in the UI.
    label: str
    #: Every accepted spelling, already lowercased and normalised.
    aliases: list[str] = Field(default_factory=list)


class LiveRule(BaseModel):
    """How to score one requirement against whatever the CV currently says."""

    id: str
    requirement: str
    essential: bool = True

    #: Empty when this requirement is judged rather than named.
    terms: list[TermGroup] = Field(default_factory=list)
    #: Whether the employer wants all of these or any one of them. Read from the
    #: post rather than assumed — an "or" list scored as "and" marks somebody
    #: unqualified for owning four of the five tools listed as alternatives.
    combine: Combine = "any"

    #: The verdict for a requirement with nothing to look up. Frozen for the
    #: session: it was decided by reading the whole CV, and it is about the
    #: person rather than about this sentence's wording.
    fixed: GapStatus | None = None

    def status_from(self, hits: int) -> GapStatus:
        """This requirement's status, given how many of its terms were found."""
        if not self.terms:
            return self.fixed or "missing"
        if hits == 0:
            return "missing"
        if self.combine == "any" or hits == len(self.terms):
            return "covered"
        return "partial"


class ScoreCard(BaseModel):
    """Everything needed to re-score a CV without another model call."""

    rules: list[LiveRule] = Field(default_factory=list)
    #: The score of the CV as it arrived, so the UI can show the movement rather
    #: than only the current figure. A number on its own does not tell somebody
    #: whether what they just did helped.
    baseline: int = 0
    #: False when embeddings were unavailable and this is a literal-only
    #: reading. It changes how much the score means, so it is not hidden.
    semantic: bool = True

    def evaluate(self, haystack: str) -> ScoreResult:
        return evaluate(self, haystack)


class RuleResult(BaseModel):
    id: str
    requirement: str
    essential: bool
    status: GapStatus
    #: Which of the named terms the text currently carries, for the UI to show
    #: what specifically is missing rather than only that something is.
    present: list[str] = Field(default_factory=list)
    absent: list[str] = Field(default_factory=list)


class ScoreResult(BaseModel):
    score: int
    baseline: int
    results: list[RuleResult] = Field(default_factory=list)

    @property
    def moved(self) -> int:
        return self.score - self.baseline


def evaluate(card: ScoreCard, haystack: str) -> ScoreResult:
    """Score a CV's text against a card. The reference implementation.

    Partial counts half, matching :meth:`GapMap.score`, so the live figure and
    the one computed after a full re-analysis are on the same scale. Two numbers
    that mean *almost* the same thing is worse than one — the person would watch
    the score jump on approval and reasonably conclude it was made up.
    """
    text = canonical(haystack)
    results: list[RuleResult] = []

    for rule in card.rules:
        present: list[str] = []
        absent: list[str] = []
        for group in rule.terms:
            (present if names_any(text, group.aliases) else absent).append(group.label)

        results.append(
            RuleResult(
                id=rule.id,
                requirement=rule.requirement,
                essential=rule.essential,
                status=rule.status_from(len(present)),
                present=present,
                absent=absent,
            )
        )

    if not results:
        return ScoreResult(score=0, baseline=card.baseline, results=[])

    earned = sum(
        1.0 if r.status == "covered" else 0.5 if r.status == "partial" else 0.0 for r in results
    )
    return ScoreResult(
        score=percent(earned, len(results)),
        baseline=card.baseline,
        results=results,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Building one
# ═══════════════════════════════════════════════════════════════════════════


def build_scorecard(job: JobAnalysis, gaps: GapMap) -> ScoreCard:
    """Turn a finished analysis into something the browser can re-run.

    Requirements are matched to gaps by their text, which is how they were
    produced — the gap map is built from these same requirements in order.
    """
    from aptly.analyse import _requirements_of

    by_text = {_key(gap.requirement): gap for gap in gaps.gaps}
    rules: list[LiveRule] = []

    for index, requirement in enumerate(_requirements_of(job)):
        gap = by_text.get(_key(requirement.text))
        terms = _term_groups(requirement.keywords, requirement.text)

        rules.append(
            LiveRule(
                id=f"req_{index}",
                requirement=requirement.text,
                essential=requirement.essential,
                terms=terms,
                combine="all" if requirement.combine == "all" else "any",
                # Only meaningful when there is nothing to look up. Carrying the
                # judged verdict on a named requirement too would let a stale
                # answer override what the CV visibly says right now.
                fixed=None if terms else (gap.status if gap else "missing"),
            )
        )

    return ScoreCard(rules=rules, baseline=gaps.score, semantic=gaps.semantic)


def _term_groups(keywords: list[str], fallback: str) -> list[TermGroup]:
    """The lookupable names in a requirement, each with its aliases.

    Only hard names take this path. A requirement whose keywords are all
    descriptions has nothing to look up and is left to its judged verdict —
    scoring "strong communication skills" by searching for that phrase would
    mark every honest CV as missing it.
    """
    candidates = [term for term in keywords if is_hard_name(term)]
    if not candidates and is_hard_name(fallback):
        candidates = [fallback]

    groups: list[TermGroup] = []
    seen: set[str] = set()
    for term in candidates:
        if not is_nameable(term):
            continue
        # Already canonical — `aliases_of` folds them. The browser receives them
        # in this form and never has to know how the folding works.
        aliases = sorted(aliases_of(term))
        key = "|".join(aliases)
        if key in seen:
            continue
        seen.add(key)
        groups.append(TermGroup(label=term.strip(), aliases=aliases))
    return groups


def _key(text: str) -> str:
    return normalize_text(text).lower()


__all__ = [
    "LiveRule",
    "RuleResult",
    "ScoreCard",
    "ScoreResult",
    "TermGroup",
    "build_scorecard",
    "evaluate",
]
