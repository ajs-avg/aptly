"""The vocabulary a redesign is allowed to speak.

Suggest mode can only say "replace the text of this line". That is why it only
ever noticed small things — it had no way to express "this section is in the
wrong place", "these bullets are in the wrong order", or "this is dead weight
for this application". Redesign mode adds those, and nothing else.

**Every operation below is a permutation or a hide.** There is no `add_section`,
no `add_bullet`, no `write_summary` — no field anywhere in this module that new
CV text could be put into. That is not an oversight and it is not a limitation
to be lifted later: it is the same mechanism the tailoring validator uses,
applied one level up. A rewrite is kept honest by having to quote its source; a
restructure is kept honest by having nothing to say except *where things go* and
*what to leave out*. A model cannot fabricate a job history with a list of
indices.

Rewriting still happens in redesign mode — it just goes through the existing
suggestion path, which already has provenance and eight layers of validation
behind it. This module moves furniture.

Dropping is reversible by construction. An op names what to leave out of *this
version*; nothing is deleted, the original document is untouched, and every drop
arrives at the UI as a card with a reason and an undo.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

OpKind = Literal[
    "reorder_sections",
    "reorder_entries",
    "reorder_bullets",
    "rename_section",
    "drop_section",
    "drop_node",
]


# ═══════════════════════════════════════════════════════════════════════════
# Operations
# ═══════════════════════════════════════════════════════════════════════════


class RestructureOp(BaseModel):
    """One change to the document's shape.

    Modelled as a single flat type with optional fields rather than as the
    tidier discriminated union of six classes, because Gemini's
    ``response_schema`` rejects ``oneOf`` with a ``discriminator`` outright — the
    request fails before it is sent. A tagged record with a ``target`` and an
    ``ids`` list expresses the same six operations in a shape the API accepts.

    Which fields matter depends on ``op``:

    ==================  ==================================================
    ``reorder_sections`` ``ids`` — every section id, in the new order
    ``reorder_entries``  ``target`` — the section; ``ids`` — its entries
    ``reorder_bullets``  ``target`` — the entry; ``ids`` — its bullets
    ``rename_section``   ``target`` — the section; ``title`` — the heading
    ``drop_section``     ``target`` — the section
    ``drop_node``        ``target`` — the line
    ==================  ==================================================

    Note what is absent: there is no field here that new CV text could be put
    into. A restructure is kept honest the same way a rewrite is kept honest by
    provenance — by having nothing to say except where things go and what to
    leave out. A model cannot fabricate a job history with a list of indices.
    """

    op: OpKind = Field(description="Which change this is.")
    target: str = Field(
        default="",
        description=(
            "The id this operates on: the section for rename_section, "
            "drop_section, reorder_entries; the entry for reorder_bullets; the "
            "line for drop_node. Leave empty for reorder_sections."
        ),
    )
    ids: list[str] = Field(
        default_factory=list,
        description=(
            "For the three reorder operations: every id in the group, in the new "
            "order. It must be all of them and only them — to leave something "
            "out, use drop_section or drop_node. Empty for the other operations."
        ),
    )
    title: str = Field(
        default="",
        description=(
            "rename_section only. A conventional heading a reader and an ATS both "
            "recognise — 'Work Experience', 'Technical Skills'. Never a claim: "
            "'Data Engineering Experience' over a frontend job history is a lie "
            "told in a heading."
        ),
    )
    reason: str = Field(
        description=(
            "One sentence arguing for this change. For a drop, the person reads "
            "this and decides, so it has to be an argument and not a verdict."
        )
    )


# ═══════════════════════════════════════════════════════════════════════════
# The plan
# ═══════════════════════════════════════════════════════════════════════════


class RedesignPlan(BaseModel):
    """What the redesign proposes to do to the shape of the document."""

    intent: str = Field(
        default="",
        description=(
            "One or two sentences: what this CV should say at a glance after the "
            "changes, that it does not say now. The argument the reordering makes."
        ),
    )
    operations: list[RestructureOp] = Field(
        default_factory=list,
        description=(
            "The changes, in the order they should be applied. Reordering the "
            "sections is usually the first and most valuable one."
        ),
    )


class Rejection(BaseModel):
    """One operation that was refused, and why. Counted, never hidden."""

    op: str
    reason: str
    detail: str = ""


class PlannedRedesign(BaseModel):
    """A checked plan: what survived, and what did not."""

    intent: str = ""
    operations: list[RestructureOp] = Field(default_factory=list)
    rejections: list[Rejection] = Field(default_factory=list)

    @property
    def drops(self) -> int:
        return sum(1 for op in self.operations if op.op in {"drop_node", "drop_section"})


__all__ = [
    "OpKind",
    "PlannedRedesign",
    "RedesignPlan",
    "Rejection",
    "RestructureOp",
]
