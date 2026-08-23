"""Applying a checked plan to a document.

Pure and total: given the same document and the same operations it produces the
same result, it never calls out to anything, and it cannot fail on a plan that
:mod:`aptly.redesign.validate` has passed.

Two properties are worth stating because the rest of the product relies on them.

**Nothing is destroyed.** A drop moves content into :attr:`Redesigned.removed`
rather than deleting it, so the UI can offer it back and the original document —
which the browser still holds — is never touched. "Reversible" is a structural
fact here, not a promise the UI keeps.

**Moved content stops being writable.** A node's anchor is an address in the
user's own file. Once a bullet has been reordered, that address points at where
it used to be, and writing through it would put the new text in the old place.
So anything that moves is re-anchored to a :class:`SyntheticAnchor`, and the
exporter reads that structurally rather than guessing. This is what makes the
"keep my styling" download honest about when it cannot.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aptly.model.anchors import SyntheticAnchor
from aptly.model.document import CVDocument, Entry, Section
from aptly.redesign.schemas import RestructureOp


@dataclass(slots=True)
class Removed:
    """One piece of the CV left out of this version, kept so it can come back."""

    kind: str
    id: str
    label: str
    reason: str


@dataclass(slots=True)
class Redesigned:
    """The restructured document, and what it cost."""

    document: CVDocument
    removed: list[Removed] = field(default_factory=list)
    #: Ids of nodes whose position changed, and which therefore can no longer be
    #: written back into the original file in place.
    moved: set[str] = field(default_factory=set)

    @property
    def rebuilt(self) -> bool:
        return bool(self.moved or self.removed)


def apply_plan(document: CVDocument, operations: list[RestructureOp]) -> Redesigned:
    """Run ``operations`` against a copy of ``document``."""
    working = document.model_copy(deep=True)
    result = Redesigned(document=working)

    for op in operations:
        if op.op == "reorder_sections":
            _reorder_sections(working, op.ids, result)
        elif op.op == "rename_section":
            _rename_section(working, op.target, op.title)
        elif op.op == "drop_section":
            _drop_section(working, op.target, op.reason, result)
        elif op.op == "reorder_entries":
            _reorder_entries(working, op.target, op.ids, result)
        elif op.op == "reorder_bullets":
            _reorder_bullets(working, op.target, op.ids, result)
        elif op.op == "drop_node":
            _drop_node(working, op.target, op.reason, result)

    _reanchor(working, result.moved)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# The operations
# ═══════════════════════════════════════════════════════════════════════════


def _reorder_sections(document: CVDocument, order: list[str], result: Redesigned) -> None:
    by_id = {section.id: section for section in document.sections}
    before = [section.id for section in document.sections]
    reordered = [by_id[section_id] for section_id in order if section_id in by_id]
    reordered.extend(section for section in document.sections if section.id not in set(order))

    document.sections = reordered
    if [section.id for section in document.sections] != before:
        result.moved.update(
            node.id for section in _changed(before, document.sections) for node in section.nodes
        )


def _rename_section(document: CVDocument, section_id: str, title: str) -> None:
    section = _section(document, section_id)
    if section is None:
        return
    section.title = title
    if section.title_node is not None:
        section.title_node.text = title


def _drop_section(document: CVDocument, section_id: str, reason: str, result: Redesigned) -> None:
    section = _section(document, section_id)
    if section is None:
        return
    document.sections = [other for other in document.sections if other.id != section_id]
    result.removed.append(
        Removed(
            kind="section",
            id=section_id,
            label=section.title or section.kind.replace("_", " ").title(),
            reason=reason,
        )
    )


def _reorder_entries(
    document: CVDocument, section_id: str, order: list[str], result: Redesigned
) -> None:
    section = _section(document, section_id)
    if section is None:
        return
    by_id = {entry.id: entry for entry in section.entries}
    before = [entry.id for entry in section.entries]
    reordered = [by_id[entry_id] for entry_id in order if entry_id in by_id]
    reordered.extend(entry for entry in section.entries if entry.id not in set(order))

    section.entries = reordered
    if [entry.id for entry in section.entries] != before:
        result.moved.update(
            node.id for entry in _changed(before, section.entries) for node in entry.nodes
        )


def _reorder_bullets(
    document: CVDocument, entry_id: str, order: list[str], result: Redesigned
) -> None:
    entry = _entry(document, entry_id)
    if entry is None:
        return
    by_id = {bullet.id: bullet for bullet in entry.bullets}
    before = [bullet.id for bullet in entry.bullets]
    reordered = [by_id[node_id] for node_id in order if node_id in by_id]
    reordered.extend(bullet for bullet in entry.bullets if bullet.id not in set(order))

    entry.bullets = reordered
    after = [bullet.id for bullet in entry.bullets]
    if after != before:
        result.moved.update(
            node_id for node_id, was in zip(after, before, strict=True) if node_id != was
        )


def _drop_node(document: CVDocument, node_id: str, reason: str, result: Redesigned) -> None:
    """Remove one line, keeping its text so the UI can offer it back.

    The lookup happens before the removal, deliberately: filtering first and
    reading afterwards leaves nothing to read, and the card would arrive with an
    empty label and no way for the person to know what they were being asked to
    give up.
    """
    for section in document.sections:
        found = next((node for node in section.loose_nodes if node.id == node_id), None)
        if found is not None:
            section.loose_nodes = [node for node in section.loose_nodes if node.id != node_id]
            result.removed.append(Removed(kind="line", id=node_id, label=found.text, reason=reason))
            return

        for entry in section.entries:
            found = next((bullet for bullet in entry.bullets if bullet.id == node_id), None)
            if found is not None:
                entry.bullets = [b for b in entry.bullets if b.id != node_id]
                result.removed.append(
                    Removed(kind="line", id=node_id, label=found.text, reason=reason)
                )
                return


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _section(document: CVDocument, section_id: str) -> Section | None:
    return next((s for s in document.sections if s.id == section_id), None)


def _entry(document: CVDocument, entry_id: str) -> Entry | None:
    for section in document.sections:
        for entry in section.entries:
            if entry.id == entry_id:
                return entry
    return None


def _changed(before: list[str], after: list) -> list:
    """The items whose index actually moved."""
    return [
        item for index, item in enumerate(after) if index >= len(before) or before[index] != item.id
    ]


def _reanchor(document: CVDocument, moved: set[str]) -> None:
    """Mark moved nodes as no longer addressable in the source file."""
    for index, node in enumerate(document.nodes):
        if node.id in moved:
            node.anchor = SyntheticAnchor(origin="redesign", index=index)


__all__ = ["Redesigned", "Removed", "apply_plan"]
