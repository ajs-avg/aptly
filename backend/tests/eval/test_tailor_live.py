"""End-to-end tailoring against the real Gemini API.

Skipped unless ``GEMINI_API_KEY`` is set, so the default test run stays free and
offline. Run it deliberately:

    uv run pytest tests/eval -v

These are not unit tests. They are the beginnings of the eval set the product
needs: fixed CV/job pairs where we know what good looks like, asserting on the
properties that matter rather than on exact wording. A model upgrade should pass
these; a regression in the prompt or the validator should not.

The assertions are deliberately about *truthfulness and shape*, never about
phrasing — asserting on phrasing would make the suite fail every time the model
improves.
"""

from __future__ import annotations

import os

import pytest
from aptly.ingest import parse_pasted
from aptly.llm.client import GeminiClient
from aptly.llm.tailor import Change, CoverageReady, JobParsed, RunDone, RunFailed, tailor
from aptly.validate import SourceMaterial, validate

pytestmark = pytest.mark.skipif(
    not os.environ.get("GEMINI_API_KEY"),
    reason="set GEMINI_API_KEY to run the live evaluation",
)

CV = """\
Priya Sharma
priya.sharma@example.com | +44 7700 900142 | London

SUMMARY
Product manager with eight years building hardware and software products.

EXPERIENCE

Senior Product Manager, Northwind Robotics — Mar 2022 – Present
- Led the end-to-end launch of a warehouse picking robot across 4 markets, taking it
  from prototype to general availability in 14 months.
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow with
  the field operations team.
- Grew monthly active installations from 40 to 310 while holding support tickets flat.

Product Manager, Halcyon Systems — Jun 2019 – Feb 2022
- Owned the scheduling module used by 1,200 daily users across 18 warehouse sites.
- Shipped a rewrite of the shift planner that reduced planning errors by 34%.

EDUCATION
MSc Human-Computer Interaction, University of Manchester — 2016 – 2017

SKILLS
Product discovery, Roadmapping, SQL, Figma, A/B testing, Jira
"""

JOB = """\
Senior Product Manager — Acme Robotics (London, hybrid)

We build autonomous mobile robots for warehouse operators. You will own a product
line end to end, from discovery through launch and into iteration.

What you will do
- Own the roadmap for our picking product and take features from discovery to GA
- Work daily with hardware and software engineering, plus field operations
- Reduce time-to-value for new customer sites
- Define and track the metrics that show the product is working

What we need
- 5+ years in product management, including hardware-plus-software launches
- Evidence of shortening customer onboarding or deployment time
- Comfort with SQL and self-serve analytics
- Experience running structured discovery with real users

Nice to have
- Kubernetes or fleet-management experience
- Experience in multi-market rollouts
"""


@pytest.fixture(scope="module")
def client() -> GeminiClient:
    return GeminiClient()


@pytest.fixture(scope="module")
async def run(client: GeminiClient) -> list:
    document = parse_pasted(CV)
    return [event async for event in tailor(document, JOB, client=client)]


async def test_the_run_completes(run: list) -> None:
    assert not [event for event in run if isinstance(event, RunFailed)]
    assert any(isinstance(event, RunDone) for event in run)


async def test_it_reads_the_job_post(run: list) -> None:
    parsed = next(event for event in run if isinstance(event, JobParsed)).job
    assert parsed.role and "product manager" in parsed.role.lower()
    assert parsed.requirements
    # The advert prints no salary, so none may be reported.
    assert parsed.salary_text is None


async def test_it_produces_usable_suggestions(run: list) -> None:
    changes = [event for event in run if isinstance(event, Change)]
    assert changes, "expected at least one suggestion for a well-matched CV"
    for change in changes:
        assert change.suggestion.reason.strip()
        assert change.suggestion.provenance.quote.strip()
        assert change.suggestion.after != change.suggestion.before


async def test_every_surfaced_suggestion_revalidates(run: list) -> None:
    """Nothing reaches the user that the validator would reject a second time."""
    document = parse_pasted(CV)
    source = SourceMaterial.build(document)
    job = next(event for event in run if isinstance(event, JobParsed)).job

    for change in (event for event in run if isinstance(event, Change)):
        verdict = validate(change.suggestion, document=document, source=source, job=job)
        assert verdict.ok, f"{verdict.rejection}: {verdict.detail}"


async def test_it_does_not_claim_kubernetes(run: list) -> None:
    """The advert asks for Kubernetes. This CV has never mentioned it.

    This is the single most likely fabrication in the whole product, which is
    why it gets its own test.
    """
    for change in (event for event in run if isinstance(event, Change)):
        assert "kubernetes" not in change.suggestion.after.lower()


async def test_it_invents_no_figures(run: list) -> None:
    from aptly.validate.entities import figures

    allowed = figures(parse_pasted(CV).plain_text())
    for change in (event for event in run if isinstance(event, Change)):
        assert not (figures(change.suggestion.after) - allowed)


async def test_it_avoids_the_tell_tale_vocabulary(run: list) -> None:
    """The "generic AI" problem, measured."""
    banned = (
        "spearheaded",
        "leveraged",
        "orchestrated",
        "championed",
        "passionate",
        "results-driven",
        "seasoned",
        "synergy",
        "cutting-edge",
        "best-in-class",
        "proven track record",
        "instrumental in",
    )
    for change in (event for event in run if isinstance(event, Change)):
        lowered = change.suggestion.after.lower()
        assert not [word for word in banned if word in lowered]


async def test_coverage_finds_what_the_cv_genuinely_has(run: list) -> None:
    events = [event for event in run if isinstance(event, CoverageReady)]
    if not events:
        pytest.skip("coverage did not run")

    coverage = events[0].coverage
    assert coverage.matches
    covered = {match.keyword.lower() for match in coverage.matches if match.covered}
    missing = {match.keyword.lower() for match in coverage.matches if not match.covered}

    # SQL is listed in the CV's skills; Kubernetes appears nowhere in it.
    assert any("sql" in term for term in covered)
    assert not any("kubernetes" in term for term in covered)
    assert covered or missing


async def test_a_run_stays_cheap(run: list) -> None:
    """Unit economics are a product constraint, not an afterthought."""
    done = next(event for event in run if isinstance(event, RunDone))
    assert done.cost_usd < 0.10, f"one tailoring cost ${done.cost_usd:.4f}"
