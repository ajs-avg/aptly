"""The live scorecard, and the contract the browser has to honour.

The match figure is computed twice — here, and again in TypeScript so it can
move while somebody types. Two implementations of one rule is a standing
invitation to drift, so this file is the specification: every case below is
mirrored in `frontend/src/lib/score.test-cases.json`, and the browser is fed the
same inputs and checked against the same answers.

Change a rule here and that file has to change with it, or the number a person
watches while editing stops agreeing with the number they are given on approval.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from aptly.analyse.scoring import LiveRule, ScoreCard, TermGroup, evaluate

#: Written out so the browser's test can read exactly what this one asserts.
CONTRACT = Path(__file__).parents[2].parent / "frontend/src/lib/score.contract.json"


def card() -> ScoreCard:
    return ScoreCard(
        baseline=17,
        rules=[
            LiveRule(
                id="r0",
                requirement="Hands-on Airflow",
                terms=[TermGroup(label="Airflow", aliases=["airflow"])],
            ),
            LiveRule(
                id="r1",
                requirement="Python and SQL",
                combine="all",
                terms=[
                    TermGroup(label="Python", aliases=["python"]),
                    TermGroup(label="SQL", aliases=["sql"]),
                ],
            ),
            LiveRule(
                id="r2",
                requirement="A cloud warehouse",
                combine="any",
                terms=[
                    TermGroup(label="Snowflake", aliases=["snowflake"]),
                    TermGroup(label="BigQuery", aliases=["bigquery"]),
                ],
            ),
            LiveRule(id="r3", requirement="Three years in data engineering", fixed="partial"),
            # A nice-to-have. Worth a third of a must-have, and present here so
            # the weighting is exercised on both sides of the contract rather
            # than only in Python.
            LiveRule(
                id="r4",
                requirement="Terraform, or any infrastructure-as-code",
                essential=False,
                terms=[TermGroup(label="Terraform", aliases=["terraform"])],
            ),
        ],
    )


# ═══════════════════════════════════════════════════════════════════════════
# Scoring
# ═══════════════════════════════════════════════════════════════════════════


def test_the_score_moves_as_terms_appear() -> None:
    """The whole reason this exists: an edit has to change the number."""
    subject = card()

    empty = evaluate(subject, "Built dashboards in JavaScript.").score
    some = evaluate(subject, "Wrote Python and SQL for the nightly job.").score
    more = evaluate(subject, "Scheduled it in Airflow, wrote Python and SQL.").score

    assert empty < some < more


def test_an_or_list_is_satisfied_by_one_of_its_options() -> None:
    """Scoring an "or" list as an "and" list marked a data engineer who owned
    four of five listed alternatives as only partly qualified."""
    result = evaluate(card(), "Modelled the warehouse in BigQuery.")
    assert _status(result, "r2") == "covered"


def test_an_and_list_needs_all_of_them() -> None:
    result = evaluate(card(), "Wrote Python scripts.")
    assert _status(result, "r1") == "partial"


def test_a_judged_requirement_does_not_move_with_the_wording() -> None:
    """It was decided by reading the whole CV, and it is a claim about the
    person. Rewriting a bullet does not give somebody three years of experience,
    and a score that pretended otherwise would be gameable by typing."""
    subject = card()

    plain = evaluate(subject, "Nothing relevant here.")
    stuffed = evaluate(subject, "Three years in data engineering. " * 5)

    assert _status(plain, "r3") == _status(stuffed, "r3") == "partial"


def test_partial_counts_half() -> None:
    """The live figure and the one from a full re-analysis have to be on the
    same scale, or the score visibly jumps on approval and looks invented."""
    result = evaluate(card(), "Wrote Python scripts.")
    # Four must-haves — Airflow missing, Python-and-SQL partial, warehouse
    # missing, the judged one partial — plus one nice-to-have, missing.
    # Earned 0.5 + 0.5 = 1.0, of a possible 4 + 0.34.
    assert result.score == 23


def test_a_must_have_outweighs_a_wish() -> None:
    """A post states a handful of conditions and then lists things it would
    like. Counting them equally is how a CV that meets every stated requirement
    scores in the fifties — which is not what a recruiter reading it would say.
    """
    subject = card()

    wish_only = evaluate(subject, "Managed infrastructure with Terraform.").score
    must_only = evaluate(subject, "Scheduled everything in Airflow.").score

    assert must_only > wish_only


def test_the_baseline_travels_with_the_card() -> None:
    """A number on its own does not tell somebody whether what they just did
    helped. The movement is the useful part."""
    result = evaluate(card(), "Scheduled it in Airflow, wrote Python and SQL.")
    assert result.baseline == 17
    assert result.moved == result.score - 17


# ═══════════════════════════════════════════════════════════════════════════
# Matching that a substring search gets wrong
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    ("text", "term", "expected"),
    [
        ("Used NoSQL stores throughout.", "SQL", False),
        ("Strong SQL, including window functions.", "SQL", True),
        ("Wrote JavaScript for the front end.", "Python", False),
        ("Deployed with Airflow.", "Airflow", True),
        ("airflow scheduling", "Airflow", True),
        ("We considered Airflow-style scheduling.", "Airflow", True),
    ],
)
def test_whole_token_matching(text: str, term: str, expected: bool) -> None:
    """ "SQL" inside "NoSQL" is a different skill, and a naive substring search
    reports it as present — which is the difference between a score somebody can
    trust and one they cannot."""
    subject = ScoreCard(
        rules=[
            LiveRule(
                id="x", requirement=term, terms=[TermGroup(label=term, aliases=[term.lower()])]
            )
        ]
    )
    assert (_status(evaluate(subject, text), "x") == "covered") is expected


def test_an_empty_card_scores_zero_rather_than_dividing_by_zero() -> None:
    assert evaluate(ScoreCard(), "anything at all").score == 0


# ═══════════════════════════════════════════════════════════════════════════
# The contract with the browser
# ═══════════════════════════════════════════════════════════════════════════

CASES: list[tuple[str, str]] = [
    ("nothing", "Built dashboards in JavaScript and CSS."),
    ("python only", "Wrote Python scripts."),
    ("python and sql", "Wrote Python and SQL for the nightly job."),
    ("everything", "Scheduled it in Airflow, wrote Python and SQL against BigQuery."),
    ("nosql trap", "Used NoSQL stores and Python."),
    ("punctuation", "Python, SQL; Airflow — all of it."),
    ("casing", "PYTHON and sql and AirFlow"),
    ("wish only", "Managed infrastructure with Terraform."),
    ("must only", "Scheduled everything in Airflow."),
]


def test_the_contract_file_matches_this_implementation() -> None:
    """Regenerates the fixture the browser's copy is tested against.

    Written rather than asserted: the Python side is the reference, so this file
    is its output, and the TypeScript test is the one that has to agree. If this
    changes, the diff shows up in review — which is the point.
    """
    subject = card()
    payload = {
        "card": subject.model_dump(mode="json"),
        "cases": [
            {
                "name": name,
                "text": text,
                "expected": evaluate(subject, text).model_dump(mode="json"),
            }
            for name, text in CASES
        ],
    }

    CONTRACT.parent.mkdir(parents=True, exist_ok=True)
    CONTRACT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    reloaded = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert len(reloaded["cases"]) == len(CASES)
    assert reloaded["cases"][0]["expected"]["score"] < reloaded["cases"][3]["expected"]["score"]


def _status(result, rule_id: str) -> str:
    return next(item.status for item in result.results if item.id == rule_id)
