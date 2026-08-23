"""The canonical CV document model.

This is what makes one-tap Apply possible. A suggestion never says "replace this
string somewhere in the CV" — it names a ``TextNode`` by id. Applying it is then
a deterministic, reversible mutation of one addressable node, not a fuzzy search
and replace that can hit the wrong line or silently do nothing.

Three properties matter and are load-bearing elsewhere:

1. **Every editable string is a** ``TextNode`` **with a stable id.** Ids survive
   edits, so version diffs and undo work across the whole history of a CV.
2. **Every node carries a** ``SourceAnchor``. That is how an edit finds its way
   back into the user's own .docx or .tex rather than into a template.
3. **Nothing is free-floating.** A node always has a role, so the tailoring
   prompt can say "these are bullets under this employer" instead of shipping a
   wall of undifferentiated text.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from aptly.model.anchors import SourceAnchor
from aptly.model.style import StyleProfile

SourceFormat = Literal["docx", "pdf", "tex", "txt", "md"]

SectionKind = Literal[
    "header",
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "publications",
    "awards",
    "languages",
    "volunteering",
    "interests",
    "custom",
]

NodeRole = Literal[
    "name",
    "contact",
    "summary",
    "section_title",
    "entry_role",
    "entry_org",
    "entry_meta",
    "bullet",
    "skill_line",
    "freeform",
]

#: Roles the tailoring pass is allowed to rewrite.
#:
#: Everything left out is a *fact about the person* rather than prose to be
#: optimised: their name, contact details, employers, job titles and dates. The
#: model is never handed those as editable, which removes an entire class of
#: fabrication before a prompt can even be tempted by it — you cannot be
#: promoted to "Senior" by a rewrite pass.
EDITABLE_ROLES: frozenset[str] = frozenset({"summary", "bullet", "skill_line", "freeform"})


# ═══════════════════════════════════════════════════════════════════════════
# Stable ids
# ═══════════════════════════════════════════════════════════════════════════


def make_node_id(prefix: str, *parts: object) -> str:
    """A short, stable id derived from a node's *position*, never its content.

    This is deliberate and load-bearing. Ids must survive an edit: version
    history, diffing and undo all work by matching the same node across two
    versions of a CV, and a suggestion generated a moment ago has to still
    address the right line after the user applies a different one.

    So callers pass structural coordinates — section index, entry index,
    sequence number, role — and never the text or the document's content hash.
    Feed either of those in and every id in the document changes the instant a
    single word does, which silently breaks every feature built on top.
    """
    raw = "\x1f".join(str(p) for p in parts)
    digest = hashlib.blake2b(raw.encode("utf-8"), digest_size=6).hexdigest()
    return f"{prefix}_{digest}"


def normalize_text(text: str) -> str:
    """Collapse whitespace and unify unicode so comparisons are meaningful.

    Word, Google Docs and LaTeX all emit different dashes, quotes and
    non-breaking spaces for text that reads identically. Anchor validation
    compares normalized forms so a smart quote never breaks an Apply.
    """
    text = unicodedata.normalize("NFKC", text)
    text = text.replace(" ", " ").replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip()


# ═══════════════════════════════════════════════════════════════════════════
# Nodes
# ═══════════════════════════════════════════════════════════════════════════


class TextNode(BaseModel):
    """One addressable piece of text in the CV."""

    id: str
    role: NodeRole
    text: str
    anchor: SourceAnchor
    #: Set when this node's appearance differs from the profile default, e.g. a
    #: job title that is bold while its bullets are not.
    style_override: dict[str, object] | None = None

    @property
    def normalized(self) -> str:
        return normalize_text(self.text)

    @property
    def editable(self) -> bool:
        return self.role in EDITABLE_ROLES

    def matches(self, expected: str) -> bool:
        """Does this node still say what a suggestion thinks it says?

        Guards every Apply. If the user edited the line after the suggestion was
        generated, this returns False and the suggestion is marked stale rather
        than overwriting their work.
        """
        return self.normalized == normalize_text(expected)


class Entry(BaseModel):
    """One job, degree, project or award."""

    id: str
    #: Role / degree / project name, employer, dates, location — parsed out for
    #: the Recruiter-Ready Card, and kept as nodes so they can be rendered back.
    role: str | None = None
    org: str | None = None
    location: str | None = None
    start: str | None = None
    end: str | None = None

    heading_nodes: list[TextNode] = Field(default_factory=list)
    bullets: list[TextNode] = Field(default_factory=list)

    @property
    def nodes(self) -> list[TextNode]:
        return [*self.heading_nodes, *self.bullets]

    @property
    def display(self) -> str:
        bits = [b for b in (self.role, self.org) if b]
        return " · ".join(bits) if bits else "(untitled)"


class Section(BaseModel):
    """A titled block of the CV."""

    id: str
    kind: SectionKind
    title: str | None = None
    title_node: TextNode | None = None
    entries: list[Entry] = Field(default_factory=list)
    #: Loose text under the heading that is not part of any entry — a summary
    #: paragraph, a comma-separated skills line.
    loose_nodes: list[TextNode] = Field(default_factory=list)

    @property
    def nodes(self) -> list[TextNode]:
        out: list[TextNode] = []
        if self.title_node:
            out.append(self.title_node)
        out.extend(self.loose_nodes)
        for entry in self.entries:
            out.extend(entry.nodes)
        return out


class ContactBlock(BaseModel):
    """Who this person is. Never rewritten — only read."""

    name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Document
# ═══════════════════════════════════════════════════════════════════════════


class CVDocument(BaseModel):
    """A CV, parsed into addressable content plus the means to write it back."""

    doc_id: str
    source_format: SourceFormat
    source_filename: str
    #: SHA-256 of the original bytes. Proves months later that this is the exact
    #: file that was sent. (Design doc: "the CV you actually sent".)
    content_hash: str
    source_blob_id: str | None = None

    style_profile: StyleProfile = Field(default_factory=StyleProfile)
    contact: ContactBlock = Field(default_factory=ContactBlock)
    sections: list[Section] = Field(default_factory=list)

    parsed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    #: Anything the parser could not do cleanly, surfaced to the user rather
    #: than swallowed. Empty is the happy path.
    warnings: list[str] = Field(default_factory=list)

    # ── traversal ────────────────────────────────────────────────────────

    @property
    def nodes(self) -> list[TextNode]:
        """Every addressable node, in reading order."""
        return [n for section in self.sections for n in section.nodes]

    @property
    def editable_nodes(self) -> list[TextNode]:
        """Only what the tailoring pass is permitted to rewrite."""
        return [n for n in self.nodes if n.editable]

    def node(self, node_id: str) -> TextNode | None:
        for n in self.nodes:
            if n.id == node_id:
                return n
        return None

    def section_of(self, node_id: str) -> Section | None:
        for section in self.sections:
            if any(n.id == node_id for n in section.nodes):
                return section
        return None

    def section(self, kind: SectionKind) -> Section | None:
        return next((s for s in self.sections if s.kind == kind), None)

    # ── text ─────────────────────────────────────────────────────────────

    def plain_text(self) -> str:
        """The whole CV as text, for keyword coverage and entity checking."""
        lines: list[str] = []
        for section in self.sections:
            if section.title:
                lines.append(section.title)
            for node in section.loose_nodes:
                lines.append(node.text)
            for entry in section.entries:
                head = " ".join(b for b in (entry.role, entry.org, entry.location) if b)
                if head:
                    lines.append(head)
                lines.extend(b.text for b in entry.bullets)
        return "\n".join(line for line in lines if line.strip())

    @property
    def word_count(self) -> int:
        return len(self.plain_text().split())

    # ── mutation ─────────────────────────────────────────────────────────

    def apply(self, node_id: str, expected_before: str, after: str) -> bool:
        """Rewrite one node, but only if it still says what we think it says.

        Returns False on a stale anchor — the caller surfaces that as
        "this line changed since we suggested it" rather than clobbering it.
        """
        node = self.node(node_id)
        if node is None or not node.matches(expected_before):
            return False
        node.text = after
        return True
