"""The structural half of the product: what a redesign may and may not do.

Redesign cannot invent — its schema has nowhere to put new text — so these tests
are about the other two ways it could hurt someone: losing content while
claiming to reorder it, and removing things that are not its to remove.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.model.document import CVDocument
from aptly.redesign.describe import describe
from aptly.redesign.ops import apply_plan
from aptly.redesign.schemas import RedesignPlan, RestructureOp
from aptly.redesign.validate import check

CV = """\
Priya Iyer
priya.iyer@example.com | +91 99860 44112 | Bengaluru

SUMMARY
Data engineer with four years building batch and streaming pipelines.

WORK EXPERIENCE

Data Engineer, Tessellate Retail — March 2023 – Present
- Rebuilt the nightly sales pipeline in Airflow, cutting the run to fifty minutes.
- Modelled the sales marts as star schemas with slowly changing dimensions.
- Ran a Kafka topic for real-time stock movements feeding replenishment.

Junior Data Engineer, Northwind Systems — July 2021 – February 2023
- Built ingestion jobs in Python against twelve partner APIs.

EDUCATION
B.Tech Computer Science, VIT Vellore — 2021

CERTIFICATIONS
Advanced CSS and Sass, Udemy — 2020

INTERESTS
Long-distance running, film photography.
"""


@pytest.fixture
def document() -> CVDocument:
    return parse_pasted(CV)


def _section(document: CVDocument, kind: str):
    return next(section for section in document.sections if section.kind == kind)


# ═══════════════════════════════════════════════════════════════════════════
# A reordering must never lose anything
# ═══════════════════════════════════════════════════════════════════════════


def test_a_partial_ordering_is_repaired_rather_than_applied_verbatim(
    document: CVDocument,
) -> None:
    """The failure this guards is silent, which is what makes it the worst one.

    A model returning four of six section ids is common. Applying that verbatim
    deletes two sections while the card says "reordered" — the person would have
    to notice on their own that part of their CV had gone.
    """
    everything = [section.id for section in document.sections]
    partial = everything[:2][::-1]

    plan = RedesignPlan(operations=[RestructureOp(op="reorder_sections", ids=partial, reason="")])
    checked = check(plan, document)

    assert len(checked.operations) == 1
    assert sorted(checked.operations[0].ids) == sorted(everything)
    assert checked.operations[0].ids[:2] == partial


def test_an_ordering_naming_nothing_real_is_refused(document: CVDocument) -> None:
    plan = RedesignPlan(
        operations=[RestructureOp(op="reorder_sections", ids=["nope_1", "nope_2"], reason="")]
    )
    checked = check(plan, document)

    assert checked.operations == []
    assert checked.rejections[0].reason == "unusable_order"


def test_applying_a_reordering_preserves_every_node(document: CVDocument) -> None:
    order = [section.id for section in document.sections][::-1]
    plan = check(
        RedesignPlan(operations=[RestructureOp(op="reorder_sections", ids=order, reason="")]),
        document,
    )

    result = apply_plan(document, plan.operations)

    assert {n.id for n in result.document.nodes} == {n.id for n in document.nodes}
    assert [s.id for s in result.document.sections] == order


def test_reordering_marks_moved_nodes_unwritable(document: CVDocument) -> None:
    """A moved line's anchor points at where it used to be.

    Writing through it would put the new text back in the old position, so the
    exporter has to be able to tell — structurally, not by guessing.
    """
    experience = _section(document, "experience")
    entry = experience.entries[0]
    order = [entry.bullets[2].id, entry.bullets[0].id, entry.bullets[1].id]

    plan = check(
        RedesignPlan(
            operations=[RestructureOp(op="reorder_bullets", target=entry.id, ids=order, reason="")]
        ),
        document,
    )
    result = apply_plan(document, plan.operations)

    moved = result.document.node(order[0])
    assert moved is not None
    assert moved.anchor.kind == "synthetic"
    assert result.rebuilt


# ═══════════════════════════════════════════════════════════════════════════
# Some things are not the model's to remove
# ═══════════════════════════════════════════════════════════════════════════


def test_the_contact_header_cannot_be_dropped(document: CVDocument) -> None:
    header = _section(document, "header")
    checked = check(
        RedesignPlan(
            operations=[RestructureOp(op="drop_section", target=header.id, reason="not relevant")]
        ),
        document,
    )

    assert checked.operations == []
    assert checked.rejections[0].reason == "not_droppable"


def test_the_only_work_history_cannot_be_dropped(document: CVDocument) -> None:
    experience = _section(document, "experience")
    checked = check(
        RedesignPlan(
            operations=[
                RestructureOp(op="drop_section", target=experience.id, reason="frontend-ish")
            ]
        ),
        document,
    )

    assert checked.operations == []
    assert checked.rejections[0].reason == "not_droppable"


def test_an_unrelated_section_can_be_dropped(document: CVDocument) -> None:
    interests = _section(document, "interests")
    checked = check(
        RedesignPlan(
            operations=[
                RestructureOp(
                    op="drop_section",
                    target=interests.id,
                    reason="The space reads better as a project.",
                )
            ]
        ),
        document,
    )

    assert len(checked.operations) == 1
    result = apply_plan(document, checked.operations)
    assert interests.id not in {s.id for s in result.document.sections}
    assert result.removed[0].reason.startswith("The space")


def test_a_job_title_cannot_be_dropped(document: CVDocument) -> None:
    """Only prose is droppable. Remove an employer and its bullets lose meaning."""
    experience = _section(document, "experience")
    heading = experience.entries[0].heading_nodes[0]

    checked = check(
        RedesignPlan(
            operations=[RestructureOp(op="drop_node", target=heading.id, reason="verbose")]
        ),
        document,
    )

    assert checked.operations == []
    assert checked.rejections[0].reason == "not_droppable"


def test_dropping_stops_once_too_much_is_gone(document: CVDocument) -> None:
    """Past a point it is not emphasis, it is rewriting the person."""
    droppable = [node for node in document.nodes if node.editable]
    plan = RedesignPlan(
        operations=[
            RestructureOp(op="drop_node", target=node.id, reason="trimming") for node in droppable
        ]
    )

    checked = check(plan, document)

    assert len(checked.operations) < len(droppable)
    assert any(r.reason == "too_much_removed" for r in checked.rejections)


def test_nothing_is_destroyed_by_a_drop(document: CVDocument) -> None:
    """Reversibility is structural: the removed content comes back with its text."""
    interests = _section(document, "interests")
    checked = check(
        RedesignPlan(
            operations=[RestructureOp(op="drop_section", target=interests.id, reason="space")]
        ),
        document,
    )
    result = apply_plan(document, checked.operations)

    assert result.removed[0].kind == "section"
    assert result.removed[0].label
    # The document handed in is untouched — the browser still holds the original.
    assert interests.id in {section.id for section in document.sections}


# ═══════════════════════════════════════════════════════════════════════════
# Coherence
# ═══════════════════════════════════════════════════════════════════════════


def test_a_rename_to_an_empty_title_is_refused(document: CVDocument) -> None:
    skills = _section(document, "education")
    checked = check(
        RedesignPlan(
            operations=[RestructureOp(op="rename_section", target=skills.id, title="  ", reason="")]
        ),
        document,
    )
    assert checked.rejections[0].reason == "empty_title"


def test_section_reordering_is_applied_before_any_section_is_dropped(
    document: CVDocument,
) -> None:
    """Otherwise the ordering still names a section that is already gone."""
    interests = _section(document, "interests")
    order = [section.id for section in document.sections][::-1]

    checked = check(
        RedesignPlan(
            operations=[
                RestructureOp(op="drop_section", target=interests.id, reason="space"),
                RestructureOp(op="reorder_sections", ids=order, reason=""),
            ]
        ),
        document,
    )

    assert checked.operations[0].op == "reorder_sections"

    result = apply_plan(document, checked.operations)
    assert interests.id not in {section.id for section in result.document.sections}


def test_describe_names_the_section_that_moved(document: CVDocument) -> None:
    """The summary is written server-side because it needs the before-state."""
    sections = [section.id for section in document.sections]
    promoted = sections[-1]
    order = [promoted, *[s for s in sections if s != promoted]]

    summary = describe(RestructureOp(op="reorder_sections", ids=order, reason=""), document)

    assert "Move" in summary
    assert "top" in summary
