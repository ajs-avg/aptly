"""Turning an operation into a sentence a person can act on.

Written on the server rather than in the UI, for one reason: the summary needs
the *original* document to say anything useful. "Move Technical Skills above
Work Experience" requires knowing what those ids were called and where they sat,
and by the time the browser has applied the operation, the before-state is gone.

The tone follows the rest of the product's voice: say what changes, in the
person's own section names, without adjectives. The argument for the change is
the operation's own ``reason`` field and is shown next to this, so this line
never needs to persuade.
"""

from __future__ import annotations

from aptly.model.document import CVDocument, Entry, Section
from aptly.redesign.schemas import RestructureOp


def describe(op: RestructureOp, document: CVDocument) -> str:
    """One line naming what this operation does, in the document's own words."""
    if op.op == "reorder_sections":
        return _reorder_sections(op.ids, document)
    if op.op == "rename_section":
        return f"Rename “{_section_name(document, op.target)}” to “{op.title}”"
    if op.op == "drop_section":
        return f"Leave out “{_section_name(document, op.target)}”"
    if op.op == "reorder_entries":
        return _reorder_entries(op.target, op.ids, document)
    if op.op == "reorder_bullets":
        return _reorder_bullets(op.target, op.ids, document)
    if op.op == "drop_node":
        return f"Leave out “{_clip(_node_text(document, op.target), 70)}”"
    return "Change the document's structure"


# ═══════════════════════════════════════════════════════════════════════════
# Per-operation phrasing
# ═══════════════════════════════════════════════════════════════════════════


def _reorder_sections(order: list[str], document: CVDocument) -> str:
    before = [section.id for section in document.sections]
    moved = _first_promoted(before, order)
    if moved is None:
        return "Keep the sections in their current order"

    name = _section_name(document, moved)
    to = order.index(moved)
    if to == 0:
        return f"Move “{name}” to the top"
    above = _section_name(document, order[to + 1]) if to + 1 < len(order) else None
    return f"Move “{name}” above “{above}”" if above else f"Move “{name}” up"


def _reorder_entries(section_id: str, order: list[str], document: CVDocument) -> str:
    section = _section(document, section_id)
    if section is None:
        return "Reorder the entries"
    before = [entry.id for entry in section.entries]
    moved = _first_promoted(before, order)
    if moved is None:
        return f"Keep the order inside “{section.title or section.kind}”"

    entry = next((e for e in section.entries if e.id == moved), None)
    label = entry.display if entry else "an entry"
    where = "first" if order.index(moved) == 0 else "earlier"
    return f"Put {label} {where} in “{section.title or section.kind}”"


def _reorder_bullets(entry_id: str, order: list[str], document: CVDocument) -> str:
    entry = _entry(document, entry_id)
    if entry is None:
        return "Reorder the bullets"
    before = [bullet.id for bullet in entry.bullets]
    moved = _first_promoted(before, order)
    if moved is None:
        return f"Keep the bullet order under {entry.display}"

    text = _clip(_node_text(document, moved), 60)
    where = "first" if order.index(moved) == 0 else "earlier"
    return f"Put “{text}” {where} under {entry.display}"


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _first_promoted(before: list[str], after: list[str]) -> str | None:
    """The item that gained the most ground, which is the one worth naming.

    A reordering usually has one intended move and several items displaced by
    it. Reporting "moved up by one" for each of those would bury the change the
    person actually needs to judge.
    """
    positions = {item: index for index, item in enumerate(before)}
    best, gain = None, 0
    for index, item in enumerate(after):
        if item not in positions:
            continue
        moved_by = positions[item] - index
        if moved_by > gain:
            best, gain = item, moved_by
    return best


def _section(document: CVDocument, section_id: str) -> Section | None:
    return next((s for s in document.sections if s.id == section_id), None)


def _entry(document: CVDocument, entry_id: str) -> Entry | None:
    for section in document.sections:
        for entry in section.entries:
            if entry.id == entry_id:
                return entry
    return None


def _section_name(document: CVDocument, section_id: str) -> str:
    section = _section(document, section_id)
    if section is None:
        return "a section"
    return section.title or section.kind.replace("_", " ").title()


def _node_text(document: CVDocument, node_id: str) -> str:
    node = document.node(node_id)
    return node.text if node else "a line"


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


__all__ = ["describe"]
