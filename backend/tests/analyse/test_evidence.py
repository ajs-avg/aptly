"""Scoring a document the evidence was not gathered from.

One run produces two CVs and scores both against the same job. The judged
answers — "does this person show three years in the role?" — are gathered once,
while reading the original, and reused for the rebuilt version: they are claims
about the *person*, and rewriting a bullet does not change how long somebody has
worked.

Reusing them only works if the check that verifies them can survive the document
changing shape. It could not: it looked the cited line up by id, and a rebuilt CV
assigns its own ids to every line. Every judged requirement was silently
downgraded, the second panel could only score on literal terms it is forbidden
from inventing, and both versions came out at exactly the same figure — which is
what made the comparison screen useless.
"""

from __future__ import annotations

from aptly.analyse import _checked_evidence
from aptly.analyse.schemas import RequirementEvidence
from aptly.ingest import parse_pasted

ORIGINAL = """\
Rahul Menon
rahul@example.com

WORK EXPERIENCE
Frontend Developer, Kalyra Commerce — 2022 to present
- Wrote a Python script that reconciles the nightly product feed.
- Built the internal pricing dashboard.
"""

#: The same facts, reordered — what a rebuild produces. The two bullets swap
#: places, which matters more than it looks: node ids are *positional*, so the
#: id that pointed at the Python line now resolves to the dashboard line. The
#: old check verified the quote against whatever sat at that id and found the
#: wrong sentence there.
REBUILT = """\
Rahul Menon
rahul@example.com

EXPERIENCE
Frontend Developer, Kalyra Commerce — 2022 to present
- Built the internal pricing dashboard for the merchandising team.
- Wrote a Python script that reconciles the nightly product feed.
"""


def _evidence(node_id: str, quote: str) -> list[RequirementEvidence]:
    return [
        RequirementEvidence(
            requirement="Production Python, particularly for data work",
            covered=True,
            node_id=node_id,
            quote=quote,
        )
    ]


def test_evidence_survives_the_document_being_rebuilt() -> None:
    """The bug behind "why is the AI version the same 23%".

    The quote is still there, in a document that renumbered everything. The
    verdict has to survive that, or the rebuilt CV starts from a worse position
    than the original for no reason the person could ever see.
    """
    original = parse_pasted(ORIGINAL)
    quote = "Wrote a Python script that reconciles the nightly product feed."
    node = next(n for n in original.nodes if quote in n.text)

    rebuilt = parse_pasted(REBUILT)
    # The id still resolves — to the wrong line. This is the trap: ids are
    # positional, so a reorder silently repoints every one of them, and a check
    # that trusts the id reads the wrong sentence and concludes the evidence is
    # gone.
    landed_on = rebuilt.node(node.id)
    assert landed_on is not None
    assert quote not in landed_on.text, "the id must point somewhere else, or this proves nothing"

    kept = _checked_evidence(_evidence(node.id, quote), rebuilt)
    answer = next(iter(kept.values()))

    assert answer.covered is True
    # And it points at the line that carries it *now*, so the UI can still show
    # the reader where the evidence sits in this version.
    assert answer.node_id is not None
    assert quote in rebuilt.node(answer.node_id).text


def test_evidence_the_rebuild_dropped_stops_counting() -> None:
    """The other half. If a version no longer says the thing, it no longer shows
    it — carrying the verdict forward regardless would let a CV score for
    content it does not contain."""
    original = parse_pasted(ORIGINAL)
    quote = "Wrote a Python script that reconciles the nightly product feed."
    node = next(n for n in original.nodes if quote in n.text)

    trimmed = parse_pasted(
        "Rahul Menon\nrahul@example.com\n\nEXPERIENCE\n"
        "Frontend Developer, Kalyra Commerce — 2022 to present\n"
        "- Built the internal pricing dashboard.\n"
    )

    kept = _checked_evidence(_evidence(node.id, quote), trimmed)
    answer = next(iter(kept.values()))

    assert answer.covered is False
    assert answer.node_id is None


def test_a_quote_that_was_never_there_is_refused() -> None:
    """Unchanged behaviour, and the reason the check exists: an answer that
    cannot be traced to the person's own words is a guess with a citation
    stapled on."""
    document = parse_pasted(ORIGINAL)

    kept = _checked_evidence(
        _evidence("nonexistent", "Led the migration of the reporting platform."),
        document,
    )
    answer = next(iter(kept.values()))

    assert answer.covered is False


def test_a_negative_answer_passes_through_untouched() -> None:
    """ "Not covered" needs no citation — there is nothing to point at."""
    document = parse_pasted(ORIGINAL)

    kept = _checked_evidence(
        [
            RequirementEvidence(
                requirement="Hands-on Airflow", covered=False, node_id=None, quote=None
            )
        ],
        document,
    )

    assert next(iter(kept.values())).covered is False
