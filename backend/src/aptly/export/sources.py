"""Exporters for text-shaped sources: .tex, .txt and .md.

These are the easiest formats to preserve because the file *is* the text. An
edit is a character-span replacement on one line, so every other byte of the
document — the LaTeX preamble, a custom command, the author's own spacing —
comes through untouched.
"""

from __future__ import annotations

from aptly.ingest.tex import to_source
from aptly.model.document import TextNode

Replacement = tuple[TextNode, str]


def export_tex(original: str, changed: list[TextNode]) -> str:
    """Apply changed nodes to LaTeX source, re-escaping as we go."""
    return _apply(original, changed, escape=to_source)


def export_text(original: str, changed: list[TextNode]) -> str:
    """Apply changed nodes to a .txt or .md source."""
    return _apply(original, changed, escape=lambda text: text)


def _apply(original: str, changed: list[TextNode], *, escape) -> str:
    lines = original.split("\n")

    # Right to left, so an earlier edit cannot shift the offsets of a later one.
    ordered = sorted(
        changed,
        key=lambda node: (node.anchor.line_start, node.anchor.char_start),  # type: ignore[union-attr]
        reverse=True,
    )

    for node in ordered:
        anchor = node.anchor
        if anchor.kind not in {"tex", "text"}:
            continue
        first, last = anchor.line_start, anchor.line_end
        if not 0 <= first <= last < len(lines):
            continue

        head = lines[first][: min(anchor.char_start, len(lines[first]))]
        tail = lines[last][min(anchor.char_end, len(lines[last])) :]
        replacement = head + escape(node.text) + tail

        # A node that spanned several wrapped lines collapses onto one. The
        # alternative — re-wrapping to guess the author's original column — would
        # be a guess, and a wrong guess is worse than a long line.
        lines[first : last + 1] = [replacement]

    return "\n".join(lines)
