"""Checking a redesign plan before any of it is shown.

The rewrite path has eight layers of validation because a rewrite can invent a
claim. A restructure cannot — the schema gives it nowhere to put one — so this
is shorter. What it guards against instead is a plan that is *incoherent* or
*destructive*: an ordering that quietly loses a section, a drop that takes the
person's entire work history, an id that names nothing.

Two principles decide what is refused rather than merely flagged.

**A reordering must be a permutation.** If the model returns nine of ten section
ids, applying it verbatim deletes a section while claiming to have reordered
them — a silent loss, which is the worst failure mode this product can have.
Missing ids are appended in their original order and the op is kept; unknown ids
are dropped. Only a reordering that has gone badly wrong is refused outright.

**Some things are not the model's to remove.** Contact details are how the
employer replies. A work history is the document. A drop that would take either
is refused no matter how well argued, and the total volume of dropped content is
capped — a redesign that removes half a CV has stopped tailoring and started
rewriting the person.
"""

from __future__ import annotations

from aptly.logging import get_logger
from aptly.model.document import CVDocument, Section
from aptly.redesign.schemas import (
    PlannedRedesign,
    RedesignPlan,
    Rejection,
    RestructureOp,
)

log = get_logger(__name__)


def _refuse(op: str, reason: str, detail: str = "") -> Rejection:
    """Build a refusal.

    A plain constructor call would be positional, and ``Rejection`` is a Pydantic
    model — which accepts keywords only. Every refusal path therefore raised
    TypeError instead of refusing, so a plan containing one bad operation took
    the whole check down rather than dropping that operation.
    """
    return Rejection(op=op, reason=reason, detail=detail)


#: Sections that exist to make the person contactable and identifiable. Removing
#: one is never a tailoring decision.
_UNDROPPABLE = frozenset({"header"})

#: Sections a CV is, rather than sections a CV has. These may be reordered and
#: their contents pruned, but the section itself may not be removed wholesale.
_LOAD_BEARING = frozenset({"experience", "education"})

#: The most of the document's editable lines a single redesign may leave out.
#: Above this it is not emphasis any more.
MAX_DROP_FRACTION = 0.35


def check(plan: RedesignPlan, document: CVDocument) -> PlannedRedesign:
    """Return the operations worth showing, and a record of what was refused."""
    kept: list[RestructureOp] = []
    rejections: list[Rejection] = []
    sections = {section.id: section for section in document.sections}
    entries = {entry.id: entry for section in document.sections for entry in section.entries}
    nodes = {node.id: node for node in document.nodes}

    droppable = _droppable_count(document)
    dropped = 0

    for op in plan.operations:
        refusal: Rejection | None = None

        if op.op == "reorder_sections":
            repaired = _repair_order(op.ids, list(sections))
            if repaired is None:
                refusal = _refuse("reorder_sections", "unusable_order", "Named no known sections.")
            else:
                op.ids = repaired

        elif op.op == "rename_section":
            if op.target not in sections:
                refusal = _refuse("rename_section", "unknown_section", op.target)
            elif not op.title.strip():
                refusal = _refuse("rename_section", "empty_title", op.target)

        elif op.op == "drop_section":
            refusal = _may_drop_section(sections.get(op.target), document)
            if refusal is None:
                cost = _weight_of_section(sections[op.target])
                if _would_exceed(dropped + cost, droppable):
                    refusal = _refuse(
                        "drop_section",
                        "too_much_removed",
                        f"Would take the dropped share past {int(MAX_DROP_FRACTION * 100)}%.",
                    )
                else:
                    dropped += cost

        elif op.op == "reorder_entries":
            section = sections.get(op.target)
            if section is None:
                refusal = _refuse("reorder_entries", "unknown_section", op.target)
            else:
                repaired = _repair_order(op.ids, [e.id for e in section.entries])
                if repaired is None:
                    refusal = _refuse("reorder_entries", "unusable_order", op.target)
                else:
                    op.ids = repaired

        elif op.op == "reorder_bullets":
            entry = entries.get(op.target)
            if entry is None:
                refusal = _refuse("reorder_bullets", "unknown_entry", op.target)
            else:
                repaired = _repair_order(op.ids, [b.id for b in entry.bullets])
                if repaired is None:
                    refusal = _refuse("reorder_bullets", "unusable_order", op.target)
                else:
                    op.ids = repaired

        elif op.op == "drop_node":
            node = nodes.get(op.target)
            if node is None:
                refusal = _refuse("drop_node", "unknown_node", op.target)
            elif not node.editable:
                # Job titles, employers, dates and contact lines. Not prose to be
                # trimmed — take one out and the lines around it stop meaning
                # anything.
                refusal = _refuse("drop_node", "not_droppable", f"role={node.role}")
            elif _would_exceed(dropped + 1, droppable):
                refusal = _refuse(
                    "drop_node",
                    "too_much_removed",
                    f"Would take the dropped share past {int(MAX_DROP_FRACTION * 100)}%.",
                )
            else:
                dropped += 1

        if refusal is not None:
            rejections.append(refusal)
            log.info(
                "redesign.rejected", op=refusal.op, reason=refusal.reason, detail=refusal.detail
            )
            continue

        kept.append(op)

    if not _keeps_a_reordering_last(kept):
        kept = _sections_first(kept)

    return PlannedRedesign(intent=plan.intent, operations=kept, rejections=rejections)


# ═══════════════════════════════════════════════════════════════════════════
# Rules
# ═══════════════════════════════════════════════════════════════════════════


def _may_drop_section(section: Section | None, document: CVDocument) -> Rejection | None:
    if section is None:
        return _refuse("drop_section", "unknown_section", "")
    if section.kind in _UNDROPPABLE:
        return _refuse(
            "drop_section",
            "not_droppable",
            "Contact details are how the employer replies to this application.",
        )
    if section.kind in _LOAD_BEARING:
        remaining = [
            other
            for other in document.sections
            if other.kind == section.kind and other.id != section.id
        ]
        if not remaining:
            return _refuse(
                "drop_section",
                "not_droppable",
                f"This is the CV's only {section.kind} section.",
            )
    return None


def _droppable_count(document: CVDocument) -> int:
    return sum(1 for node in document.nodes if node.editable)


def _weight_of_section(section: Section) -> int:
    return sum(1 for node in section.nodes if node.editable)


def _would_exceed(dropped: int, droppable: int) -> bool:
    if droppable <= 0:
        return True
    return dropped / droppable > MAX_DROP_FRACTION


def _repair_order(given: list[str], actual: list[str]) -> list[str] | None:
    """Turn a partial or dirty ordering into a genuine permutation.

    Models return orderings that are *nearly* right — one id misspelled, one
    forgotten. Refusing those loses a good reordering over a typo; applying them
    verbatim silently deletes whatever was left out. So unknown ids are dropped,
    forgotten ones are appended in their original relative order, and only an
    ordering that overlaps the document not at all is refused.
    """
    known = set(actual)
    seen: set[str] = set()
    ordered = [item for item in given if item in known and not (item in seen or seen.add(item))]
    if not ordered:
        return None
    ordered.extend(item for item in actual if item not in seen)
    return ordered


def _keeps_a_reordering_last(ops: list[RestructureOp]) -> bool:
    """Is any section reordering already ahead of the section drops?"""
    first_reorder = next((i for i, op in enumerate(ops) if op.op == "reorder_sections"), None)
    first_drop = next((i for i, op in enumerate(ops) if op.op == "drop_section"), None)
    return first_reorder is None or first_drop is None or first_reorder < first_drop


def _sections_first(ops: list[RestructureOp]) -> list[RestructureOp]:
    """Apply the section reordering before anything removes a section from it.

    A reordering names every section; if a drop has already run, the ordering
    still references the dropped one and the repair above would re-append it.
    Ordering the operations here means neither the model nor the caller has to
    think about it.
    """
    reorders = [op for op in ops if op.op == "reorder_sections"]
    rest = [op for op in ops if op.op != "reorder_sections"]
    return [*reorders, *rest]


__all__ = ["MAX_DROP_FRACTION", "check"]
