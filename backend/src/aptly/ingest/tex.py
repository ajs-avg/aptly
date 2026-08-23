"""LaTeX (.tex) parser.

Counter-intuitively the *highest* fidelity format we support: the source is
plain text, so an edit is a surgical replacement of the content inside a macro
and everything else — document class, spacing, custom commands, the user's own
template — is untouched. Recompiling reproduces their CV exactly.

The parser is line-oriented on purpose. A full LaTeX grammar would be a project
of its own and would still fail on the macro soup that CV templates are made of.
What we actually need is much narrower: find the text a human wrote, and record
precisely which characters to swap out later.
"""

from __future__ import annotations

import re

from aptly.ingest.builder import ParsedLine, build_document
from aptly.model.anchors import TexAnchor
from aptly.model.document import CVDocument
from aptly.model.style import FontSpec, Margins, StyleProfile

#: Macros whose braced argument is a section heading.
_HEADING_MACROS = ("section", "section*", "cvsection", "resumeSection", "rSection")
#: Macros whose braced argument is a sub-heading (job title, degree).
_SUBHEADING_MACROS = ("subsection", "subsection*", "cvsubsection", "resumeSubheading")

_COMMENT = re.compile(r"(?<!\\)%.*$")
_ITEM = re.compile(r"^\s*\\item\b\s*")
_MACRO_ARG = re.compile(r"^\s*\\([A-Za-z@*]+)\s*(?:\[[^\]]*\])?\s*\{")
_ENVIRONMENT = re.compile(r"^\s*\\(?:begin|end)\s*\{([^}]*)\}")
_DOCUMENTCLASS = re.compile(r"\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}")
_GEOMETRY = re.compile(r"\\geometry\s*\{([^}]*)\}")

#: Inline formatting to unwrap for display; the raw source keeps them.
_INLINE_WRAPPERS = re.compile(
    r"\\(?:textbf|textit|emph|texttt|textsc|underline|textsl|mbox|text)\s*\{"
)

_ESCAPES = {
    r"\%": "%",
    r"\&": "&",
    r"\_": "_",
    r"\#": "#",
    r"\$": "$",
    r"\{": "{",
    r"\}": "}",
    r"\textasciitilde": "~",
    r"\textasciicircum": "^",
    r"\textbackslash": "\\",
    r"\\": "\n",
    r"~": " ",
    "``": '"',
    "''": '"',
    r"\ ": " ",
    r"\,": " ",
    r"\LaTeX": "LaTeX",
    r"\TeX": "TeX",
}


def parse_tex(
    raw: str,
    *,
    doc_id: str,
    source_filename: str,
    content_hash: str,
) -> CVDocument:
    """Parse a .tex CV."""
    source_lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    parsed: list[ParsedLine] = []
    in_body = "\\begin{document}" not in raw  # a fragment with no preamble
    prev_blank = False

    for i, source_line in enumerate(source_lines):
        stripped_comment = _COMMENT.sub("", source_line)
        stripped = stripped_comment.strip()

        if not in_body:
            if "\\begin{document}" in stripped:
                in_body = True
            continue
        if "\\end{document}" in stripped:
            break

        if not stripped:
            prev_blank = True
            continue
        if _ENVIRONMENT.match(stripped) or stripped.startswith("\\usepackage"):
            continue

        extracted = _extract_content(stripped_comment)
        if extracted is None:
            prev_blank = False
            continue

        text, span, macro = extracted
        display = _to_display(text)
        if not display.strip():
            prev_blank = False
            continue

        parsed.append(
            ParsedLine(
                text=display,
                anchor=TexAnchor(
                    line_start=i,
                    line_end=i,
                    char_start=span[0],
                    char_end=span[1],
                    macro=macro,
                ),
                bold=macro in _HEADING_MACROS or macro in _SUBHEADING_MACROS,
                size_pt=_heading_size(macro),
                is_list_item=macro == "item",
                gap_before=prev_blank,
            )
        )
        prev_blank = False

    return build_document(
        parsed,
        doc_id=doc_id,
        source_format="tex",
        source_filename=source_filename,
        content_hash=content_hash,
        style_profile=_extract_style(raw),
    )


# ═══════════════════════════════════════════════════════════════════════════
# Content extraction
# ═══════════════════════════════════════════════════════════════════════════


def _extract_content(line: str) -> tuple[str, tuple[int, int], str | None] | None:
    """Find the human-written text on this line and where it sits.

    Returns ``(text, (char_start, char_end), macro)``. The span is what the
    exporter rewrites, so it must exclude the macro itself — replacing
    ``\\item Led the launch`` must leave ``\\item `` in place.
    """
    if item := _ITEM.match(line):
        start = item.end()
        end = len(line.rstrip())
        content = line[start:end]
        if not content.strip():
            return None
        return content, (start, end), "item"

    if macro_match := _MACRO_ARG.match(line):
        macro = macro_match.group(1)
        open_brace = macro_match.end() - 1
        close_brace = _match_brace(line, open_brace)
        if close_brace is None:
            return None

        # Only claim the braced argument when it *is* the line. An entry heading
        # like ``\textbf{Senior Engineer}, Acme \hfill 2022--Present`` carries
        # the employer and dates after the brace; taking just the argument would
        # silently drop them.
        if not _is_trailing_noise(line[close_brace + 1 :]):
            return _whole_line(line)

        start, end = open_brace + 1, close_brace
        content = line[start:end]
        if not content.strip():
            return None
        return content, (start, end), macro

    # Bare prose (common in a summary paragraph), and brace-wrapped text such as
    # ``{\LARGE \textbf{Ada Lovelace}}``.
    if line.lstrip().startswith("\\"):
        return None
    return _whole_line(line)


def _whole_line(line: str) -> tuple[str, tuple[int, int], str | None] | None:
    """Treat the entire line as editable content."""
    lead = len(line) - len(line.lstrip())
    end = len(line.rstrip())
    if end <= lead:
        return None
    return line[lead:end], (lead, end), None


#: What may follow a macro's argument and still leave it the whole story:
#: a line break, spacing, alignment glue, or nothing at all.
_TRAILING_NOISE = re.compile(
    r"^(?:\s|\\\\(?:\s*\[[^\]]*\])?|\\(?:hfill|newline|par|vspace\*?|bigskip|medskip|smallskip|clearpage)\b"
    r"|\{[^{}]*\}|\[[^\]]*\]|[,;.]|\s*%.*)*$"
)


def _is_trailing_noise(rest: str) -> bool:
    return bool(_TRAILING_NOISE.match(rest))


def _match_brace(text: str, open_index: int) -> int | None:
    """Index of the ``}`` matching the ``{`` at ``open_index``, or None."""
    depth = 0
    i = open_index
    while i < len(text):
        char = text[i]
        if char == "\\":
            i += 2
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def _to_display(text: str) -> str:
    """Strip inline formatting macros and unescape, for reading and editing."""
    out = text
    for _ in range(4):  # nested \textbf{\emph{...}}
        match = _INLINE_WRAPPERS.search(out)
        if not match:
            break
        open_brace = match.end() - 1
        close = _match_brace(out, open_brace)
        if close is None:
            break
        out = out[: match.start()] + out[open_brace + 1 : close] + out[close + 1 :]

    out = re.sub(r"\\(?:href|url)\s*\{([^}]*)\}\s*\{([^}]*)\}", r"\2 (\1)", out)
    out = re.sub(r"\\(?:href|url)\s*\{([^}]*)\}", r"\1", out)
    # A line break with an optional spacing argument: ``\\[3pt]``. Must go
    # before the bare ``\\`` rule below, or the ``[3pt]`` is left stranded.
    out = re.sub(r"\\\\\s*\[[^\]]*\]", " ", out)
    out = re.sub(r"\\(?:hfill|newline|vspace\*?|hspace\*?|bigskip|medskip|smallskip)\b", " ", out)
    out = re.sub(r"\\[A-Za-z@]+\s*\{([^{}]*)\}", r"\1", out)

    for escaped, plain in _ESCAPES.items():
        out = out.replace(escaped, plain)
    # Size and style switches carry no text of their own: ``{\LARGE Ada}``.
    out = re.sub(r"\\[A-Za-z@]+", "", out)
    out = out.replace("{", " ").replace("}", " ")
    return re.sub(r"\s+", " ", out).strip()


def to_source(text: str) -> str:
    """Escape display text back into LaTeX. The inverse of :func:`_to_display`.

    Order matters: the backslash must be escaped first or it would double-escape
    every sequence introduced afterwards.
    """
    out = text.replace("\\", r"\textbackslash{}")
    for char in ("&", "%", "$", "#", "_", "{", "}"):
        out = out.replace(char, "\\" + char)
    out = out.replace("~", r"\textasciitilde{}").replace("^", r"\textasciicircum{}")
    return out


def _heading_size(macro: str | None) -> float | None:
    if macro in _HEADING_MACROS:
        return 13.0
    if macro in _SUBHEADING_MACROS:
        return 11.5
    return None


def _extract_style(raw: str) -> StyleProfile:
    """Read what the preamble declares about page setup and type size."""
    body_pt = 10.5
    if cls := _DOCUMENTCLASS.search(raw):
        options = (cls.group(1) or "").lower()
        for candidate in (10, 11, 12):
            if f"{candidate}pt" in options:
                body_pt = float(candidate)
                break

    margins = Margins(top_pt=54.0, right_pt=54.0, bottom_pt=54.0, left_pt=54.0)
    if geo := _GEOMETRY.search(raw):
        spec = geo.group(1)
        if margin := re.search(r"margin\s*=\s*([\d.]+)\s*(cm|in|mm|pt)", spec):
            value, unit = float(margin.group(1)), margin.group(2)
            pt = {"cm": 28.35, "mm": 2.835, "in": 72.0, "pt": 1.0}[unit] * value
            margins = Margins(top_pt=pt, right_pt=pt, bottom_pt=pt, left_pt=pt)

    family = "Latin Modern Roman"
    if "\\usepackage{helvet}" in raw or "\\usepackage[scaled]{helvet}" in raw:
        family = "Helvetica"
    elif "fontspec" in raw and (main := re.search(r"\\setmainfont\s*\{([^}]*)\}", raw)):
        family = main.group(1)

    return StyleProfile(
        margins=margins,
        body=FontSpec(family=family, size_pt=body_pt),
        name=FontSpec(family=family, size_pt=body_pt + 9, bold=True),
        section_heading=FontSpec(family=family, size_pt=body_pt + 2, bold=True),
        entry_heading=FontSpec(family=family, size_pt=body_pt + 0.5, bold=True),
        heading_rule=True,
    )
