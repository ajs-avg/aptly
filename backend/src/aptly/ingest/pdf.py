"""PDF parser.

The hard case, and the one to be honest about. A PDF is a *print* format: it
stores "draw this glyph at (x, y)", not "this is a sentence". There is no
reflow, so a longer replacement line would overlap or clip its neighbour. We
therefore never edit a PDF in place.

What we do instead is measure it. Every character carries its font, size, colour
and position, so we can infer a style profile precise enough to rebuild a close
visual match — and, importantly, produce a document that *is* editable from then
on. The user is told this happened; it is never silent.

Built on pdfminer.six rather than pdfplumber: pure Python, MIT, and it hands us
per-character detail directly, which is exactly what the style profile needs.
"""

from __future__ import annotations

import re
import statistics
from collections import Counter
from dataclasses import dataclass
from itertools import pairwise

from pdfminer.high_level import extract_pages
from pdfminer.layout import (
    LAParams,
    LTChar,
    LTLine,
    LTPage,
    LTRect,
    LTTextContainer,
    LTTextLine,
)

from aptly.ingest.builder import ParsedLine, build_document
from aptly.model.anchors import PdfAnchor
from aptly.model.document import CVDocument
from aptly.model.style import FontSpec, Margins, StyleProfile

#: Tuned for CVs: tight line spacing, generous word gaps, and no column
#: guessing from pdfminer — we detect columns ourselves, more conservatively.
_LAPARAMS = LAParams(
    line_margin=0.35,
    char_margin=2.0,
    word_margin=0.1,
    boxes_flow=0.5,
    detect_vertical=False,
)

_BOLD_HINTS = ("bold", "black", "heavy", "semibold", "demibold", "600", "700", "800")
_ITALIC_HINTS = ("italic", "oblique")


@dataclass(slots=True)
class _Line:
    text: str
    page: int
    bbox: tuple[float, float, float, float]
    size: float
    family: str
    bold: bool
    italic: bool
    color: str
    column: int = 0

    @property
    def x0(self) -> float:
        return self.bbox[0]

    @property
    def top(self) -> float:
        return self.bbox[1]


@dataclass(frozen=True, slots=True)
class PdfParse:
    """A parsed PDF plus the evidence needed to judge how well it went.

    ``raw_text`` is deliberately the extractor's output *before* glyph cleanup.
    Unmapped ``(cid:N)`` markers are the clearest sign that a font's encoding
    defeated us, and cleanup is what removes them — so by the time the document
    exists, the evidence is gone.
    """

    document: CVDocument
    pages: int
    raw_text: str


def parse_pdf(
    path: str,
    *,
    doc_id: str,
    source_filename: str,
    content_hash: str,
) -> CVDocument:
    """Parse a .pdf CV by measuring its glyphs."""
    return parse_pdf_detailed(
        path,
        doc_id=doc_id,
        source_filename=source_filename,
        content_hash=content_hash,
    ).document


def parse_pdf_detailed(
    path: str,
    *,
    doc_id: str,
    source_filename: str,
    content_hash: str,
) -> PdfParse:
    """Parse a .pdf CV, reporting what the extractor had to work with."""
    pages = list(extract_pages(path, laparams=_LAPARAMS))
    lines: list[_Line] = []
    raw: list[str] = []
    page_w, page_h = 595.28, 841.89

    rules = 0
    for page_no, page in enumerate(pages):
        if page_no == 0:
            page_w, page_h = float(page.width), float(page.height)
        lines.extend(_lines_on_page(page, page_no))
        raw.extend(_raw_lines(page))
        rules += _count_rules(page)

    raw_text = "\n".join(raw)
    page_count = max(len(pages), 1)

    warnings: list[str] = []
    if not lines:
        warnings.append(
            "No selectable text was found. This looks like a scanned or image-only PDF — "
            "upload a .docx or paste your CV as text instead."
        )
        return PdfParse(
            build_document(
                [],
                doc_id=doc_id,
                source_format="pdf",
                source_filename=source_filename,
                content_hash=content_hash,
                style_profile=StyleProfile(inferred=True),
                warnings=warnings,
            ),
            pages=page_count,
            raw_text=raw_text,
        )

    columns = _assign_columns(lines, page_w)
    ordered = _rejoin_wrapped(_reading_order(lines, columns))

    warnings.append(
        "PDFs cannot be edited in place — text in a PDF has no reflow. Aptly matched "
        "your fonts, spacing and layout and will rebuild a close copy. "
        "Upload the .docx instead for a pixel-perfect result."
    )
    if columns > 1:
        warnings.append(
            f"Detected a {columns}-column layout. Many ATS read columns out of order — "
            "the rebuild uses a single column, which parses more reliably."
        )

    parsed = [
        ParsedLine(
            text=line.text,
            anchor=PdfAnchor(
                page=line.page,
                line_index=index,
                bbox=line.bbox,
                column=line.column,
            ),
            bold=line.bold,
            italic=line.italic,
            size_pt=line.size,
        )
        for index, line in enumerate(ordered)
    ]

    return PdfParse(
        build_document(
            parsed,
            doc_id=doc_id,
            source_format="pdf",
            source_filename=source_filename,
            content_hash=content_hash,
            style_profile=_extract_style(ordered, page_w, page_h, columns, rules=rules),
            warnings=warnings,
        ),
        pages=page_count,
        raw_text=raw_text,
    )


def _raw_lines(page: LTPage) -> list[str]:
    """Every text line on the page, exactly as the extractor produced it."""
    out: list[str] = []
    for container in page:
        if not isinstance(container, LTTextContainer):
            continue
        for line in container:
            if isinstance(line, LTTextLine):
                out.append(line.get_text().rstrip("\n"))
    return out


# ═══════════════════════════════════════════════════════════════════════════
# Extraction
# ═══════════════════════════════════════════════════════════════════════════


def _lines_on_page(page: LTPage, page_no: int) -> list[_Line]:
    out: list[_Line] = []
    for container in page:
        if not isinstance(container, LTTextContainer):
            continue
        for line in container:
            if not isinstance(line, LTTextLine):
                continue
            measured = _measure(line, page_no)
            if measured is not None:
                out.append(measured)
    return out


#: A rule is wider than this and thinner than :data:`_MAX_RULE_HEIGHT`.
_MIN_RULE_WIDTH = 60.0
_MAX_RULE_HEIGHT = 3.0


def _count_rules(page: LTPage) -> int:
    """Horizontal rules drawn on the page.

    Section headings underlined with a hairline are extremely common, and the
    rule is a *graphic*, not text — so it is invisible to the text extractor and
    the rebuild drops it, which is one of the most noticeable ways a rebuilt CV
    stops looking like the original.
    """
    count = 0
    for element in page:
        if not isinstance(element, (LTRect, LTLine)):
            continue
        width = abs(element.x1 - element.x0)
        height = abs(element.y1 - element.y0)
        if width >= _MIN_RULE_WIDTH and height <= _MAX_RULE_HEIGHT:
            count += 1
    return count


def _measure(line: LTTextLine, page_no: int) -> _Line | None:
    """Reduce a line's characters to one dominant appearance.

    A line can mix fonts (a bolded lead-in, an italic company name). We take the
    modal font weighted by character count, which is what a reader perceives as
    "the style of this line".
    """
    text = _clean_glyphs(line.get_text().strip())
    if not text:
        return None

    chars = [c for c in line if isinstance(c, LTChar) and c.get_text().strip()]
    if not chars:
        return None

    sizes = [round(c.size, 1) for c in chars]
    families = Counter(_clean_font(c.fontname) for c in chars)
    family = families.most_common(1)[0][0]

    bold_chars = sum(1 for c in chars if _has_hint(c.fontname, _BOLD_HINTS))
    italic_chars = sum(1 for c in chars if _has_hint(c.fontname, _ITALIC_HINTS))
    colors = Counter(_color_hex(c) for c in chars)

    return _Line(
        text=text,
        page=page_no,
        bbox=(float(line.x0), float(line.y1), float(line.x1), float(line.y0)),
        size=statistics.median(sizes),
        family=family,
        bold=bold_chars / len(chars) > 0.6,
        italic=italic_chars / len(chars) > 0.6,
        color=colors.most_common(1)[0][0],
    )


#: pdfminer emits ``(cid:NNN)`` for a glyph whose font carries no usable
#: encoding — extremely common for bullet dingbats in subset-embedded fonts.
_CID = re.compile(r"\(cid:(\d+)\)")

#: The handful of cids that are, in practice, always a bullet.
_CID_BULLETS = {127, 128, 129, 149, 8226}


def _clean_glyphs(text: str) -> str:
    """Replace unmapped ``(cid:N)`` glyphs with a real bullet, or drop them.

    Left in place, these leak into suggestion cards as literal ``(cid:127)`` and
    make the "before" text impossible to match, which breaks Apply.
    """
    if "(cid:" not in text:
        return text

    def swap(match: re.Match[str]) -> str:
        return "•" if int(match.group(1)) in _CID_BULLETS else " "

    return re.sub(r"\s+", " ", _CID.sub(swap, text)).strip()


def _clean_font(fontname: str) -> str:
    """``ABCDEF+Poppins-Medium`` → ``Poppins``.

    PDFs prefix subset-embedded fonts with six random uppercase letters and a
    plus sign, then append the weight to the family name.
    """
    name = fontname.split("+", 1)[-1]
    name = name.split(",", 1)[0]
    if "-" in name:
        head, _, tail = name.rpartition("-")
        if head and _has_hint(
            tail,
            (*_BOLD_HINTS, *_ITALIC_HINTS, "regular", "roman", "light", "medium", "book", "thin"),
        ):
            name = head
    return name.replace("MT", "").replace("PS", "").strip() or "Helvetica"


def _has_hint(name: str, hints: tuple[str, ...]) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in hints)


def _color_hex(char: LTChar) -> str:
    """Non-stroking colour of a character as ``#rrggbb``."""
    state = getattr(char, "graphicstate", None)
    raw = getattr(state, "ncolor", None) if state else None

    if isinstance(raw, (int, float)):
        value = _channel(raw)
        return f"#{value:02x}{value:02x}{value:02x}"
    if isinstance(raw, (tuple, list)):
        if len(raw) == 3:
            r, g, b = (_channel(v) for v in raw)
            return f"#{r:02x}{g:02x}{b:02x}"
        if len(raw) == 4:  # CMYK
            c, m, y, k = (float(v) for v in raw)
            r = _channel((1 - c) * (1 - k))
            g = _channel((1 - m) * (1 - k))
            b = _channel((1 - y) * (1 - k))
            return f"#{r:02x}{g:02x}{b:02x}"
        if len(raw) == 1:
            value = _channel(raw[0])
            return f"#{value:02x}{value:02x}{value:02x}"
    return "#16181D"


def _channel(value: float) -> int:
    return max(0, min(255, round(float(value) * 255)))


# ═══════════════════════════════════════════════════════════════════════════
# Columns and reading order
# ═══════════════════════════════════════════════════════════════════════════


def _assign_columns(lines: list[_Line], page_width: float) -> int:
    """Detect a two-column layout and tag each line with its column.

    Works by finding the *gutter* — the widest vertical band of the page that no
    line crosses — rather than assuming the split sits at the midpoint. Real
    sidebar CVs put the divide around a third of the way across, so a midpoint
    test misses them entirely and the two columns end up interleaved, which
    shuffles someone's job history into their contact details.

    Deliberately strict: a real gutter, substantial text on both sides, and both
    sides spanning a real portion of the page height.
    """
    if len(lines) < 12:
        return 1

    gutter = _find_gutter(lines, page_width)
    if gutter is None:
        return 1

    left = [ln for ln in lines if ln.bbox[2] <= gutter]
    right = [ln for ln in lines if ln.x0 >= gutter]

    if len(left) < 5 or len(right) < 5:
        return 1
    if len(left) + len(right) < len(lines) * 0.9:
        return 1
    page_height = max((ln.top for ln in lines), default=842.0)
    if (
        _vertical_span(left, page_height) < _MIN_COLUMN_SPAN
        or _vertical_span(right, page_height) < _MIN_COLUMN_SPAN
    ):
        return 1

    for line in lines:
        line.column = 0 if line.bbox[2] <= gutter else 1
    return 2


#: How much of the page a side must cover to count as a column. This exists to
#: reject a *header band* — a wide row across the top, which spans under 10% —
#: not to demand that both columns are full length. A short right-hand column is
#: perfectly normal when the sidebar is the longer of the two.
_MIN_COLUMN_SPAN = 0.20


#: A gutter narrower than this is ordinary word spacing, not a column divide.
_MIN_GUTTER_PT = 14.0


def _find_gutter(lines: list[_Line], page_width: float) -> float | None:
    """The x coordinate of the widest empty vertical band, if there is one.

    Only bands between 15% and 70% of the page width are considered — outside
    that range we are looking at a margin, not a divide between columns.
    """
    width = int(page_width) + 1
    covered = bytearray(width)
    for line in lines:
        start = max(0, int(line.x0))
        end = min(width, int(line.bbox[2]) + 1)
        for x in range(start, end):
            covered[x] = 1

    low, high = int(page_width * 0.15), int(page_width * 0.70)
    best_width, best_centre = 0, None
    run_start: int | None = None

    for x in range(low, high + 1):
        if not covered[x]:
            run_start = x if run_start is None else run_start
            continue
        if run_start is not None:
            if (run := x - run_start) > best_width:
                best_width, best_centre = run, run_start + run / 2
            run_start = None

    if run_start is not None and (run := high + 1 - run_start) > best_width:
        best_width, best_centre = run, run_start + run / 2

    return best_centre if best_width >= _MIN_GUTTER_PT else None


def _vertical_span(lines: list[_Line], page_height: float) -> float:
    """How much of the page height these lines cover, as a fraction."""
    tops = [ln.top for ln in lines]
    if not tops or page_height <= 0:
        return 0.0
    return (max(tops) - min(tops)) / page_height


def _reading_order(lines: list[_Line], columns: int) -> list[_Line]:
    """Sort lines the way a person reads them."""
    if columns == 1:
        return sorted(lines, key=lambda ln: (ln.page, -ln.top, ln.x0))
    # Left column of a page in full, then the right column of that page.
    return sorted(lines, key=lambda ln: (ln.page, ln.column, -ln.top, ln.x0))


def _rejoin_wrapped(lines: list[_Line]) -> list[_Line]:
    """Glue visually-wrapped lines back into the sentence they came from.

    A PDF has no paragraphs: a bullet that runs onto a second line is simply two
    unrelated runs of glyphs. Left split, each half becomes its own suggestion
    card showing half a sentence, and the "before" text never matches what the
    person sees. This is the single most important repair in the PDF path.

    The signals that a line continues the one above it: same left edge, same
    type size, and the line above stopped mid-sentence.
    """
    out: list[_Line] = []

    for line in lines:
        prev = out[-1] if out else None
        if prev is not None and _continues(prev, line):
            prev.text = f"{prev.text} {line.text}"
            prev.bbox = (prev.bbox[0], prev.bbox[1], max(prev.bbox[2], line.bbox[2]), line.bbox[3])
            continue
        out.append(line)

    return out


#: A line ending in one of these has finished its thought. A comma or colon
#: means the opposite, so only full stops qualify.
_TERMINAL = ".!?"

_BULLET_GLYPHS = "•▪◦‣∙·●○◆■□-–—*"

#: How far a hanging indent may sit from its bullet glyph, in points.
_MAX_HANGING_INDENT = 40.0


def _continues(prev: _Line, line: _Line) -> bool:
    if prev.page != line.page or prev.column != line.column:
        return False
    if abs(prev.size - line.size) > 0.6:
        return False
    # A new bullet, or a new labelled item ('Core CS: …'), is a new thought
    # however the line above ended.
    if line.text[:1] in _BULLET_GLYPHS or _starts_with_label(line.text):
        return False
    # Contact rows sit flush and unpunctuated, and must not be concatenated
    # into one unusable blob.
    if _is_contact(prev.text) or _is_contact(line.text):
        return False
    # An all-caps section heading never wraps into its own content.
    if _is_heading_shaped(prev.text):
        return False

    # A hanging indent under a bullet: the glyph sits at the left margin and
    # every wrapped line aligns with the text beside it.
    #
    # The exception exists because bullet glyphs are unreliable in PDFs — they
    # are often dingbats in a subset font with no usable encoding, and sometimes
    # they simply do not survive extraction at all. When the glyph is missing,
    # the next bullet is visually indistinguishable from a wrapped line. A full
    # stop followed by a capital is the only remaining evidence, so we take it:
    # splitting one bullet in two is a smaller harm than silently merging two
    # bullets into a single change card that rewrites both at once.
    if prev.text[:1] in _BULLET_GLYPHS and 0 < line.x0 - prev.x0 <= _MAX_HANGING_INDENT:
        return not _looks_like_a_fresh_sentence(prev.text, line.text)

    if abs(prev.x0 - line.x0) > 2.0:
        return False
    return not prev.text.rstrip().endswith(tuple(_TERMINAL))


def _looks_like_a_fresh_sentence(previous: str, line: str) -> bool:
    """Did the line above finish, and does this one start something new?

    Only meaningful together: a full stop alone happens mid-bullet all the time,
    and a capital alone starts plenty of continuations ("…deployed to AWS").
    """
    if not previous.rstrip().endswith(tuple(_TERMINAL)):
        return False
    first = line.lstrip()[:1]
    return bool(first) and first.isupper()


def _is_contact(text: str) -> bool:
    from aptly.ingest.sections import is_contact_line

    return is_contact_line(text)


def _starts_with_label(text: str) -> bool:
    from aptly.ingest.sections import starts_with_label

    return starts_with_label(text)


def _is_heading_shaped(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters) and len(text.split()) <= 4


# ═══════════════════════════════════════════════════════════════════════════
# Style
# ═══════════════════════════════════════════════════════════════════════════


def _extract_style(
    lines: list[_Line], page_width: float, page_height: float, columns: int, *, rules: int = 0
) -> StyleProfile:
    """Infer the document's visual identity so the rebuild can match it."""
    sizes = Counter(round(ln.size * 2) / 2 for ln in lines)
    body_pt = sizes.most_common(1)[0][0]

    body_lines = [ln for ln in lines if abs(ln.size - body_pt) < 0.6]
    families = Counter(ln.family for ln in body_lines or lines)
    body_family = families.most_common(1)[0][0]
    body_color = Counter(ln.color for ln in body_lines or lines).most_common(1)[0][0]

    headings = [ln for ln in lines if ln.size > body_pt + 0.4 and ln.bold]
    heading = min(headings, key=lambda ln: ln.size) if headings else None
    name_line = max(lines, key=lambda ln: ln.size) if lines else None

    # Left, right and top are genuinely measurable from where the text sits.
    # The bottom is not: a one-page CV whose content ends halfway down the sheet
    # would report a 400pt "margin", which then squeezes the rebuild into a
    # sliver of the page. Documents are laid out with a symmetric bottom margin,
    # so mirror the top and cap it at what was actually observed.
    top_pt = page_height - max(ln.top for ln in lines)
    observed_bottom = min(ln.bbox[3] for ln in lines)
    margins = Margins(
        left_pt=min(ln.x0 for ln in lines),
        right_pt=max(0.0, page_width - max(ln.bbox[2] for ln in lines)),
        top_pt=top_pt,
        bottom_pt=min(observed_bottom, top_pt),
    )

    upper = [ln for ln in headings if ln.text.isupper()]
    accent = next(
        (ln.color for ln in headings if ln.color.lower() not in {body_color.lower(), "#000000"}),
        None,
    )

    return StyleProfile(
        page_width_pt=page_width,
        page_height_pt=page_height,
        margins=margins,
        columns=columns,
        body=FontSpec(family=body_family, size_pt=body_pt, color=body_color),
        name=FontSpec(
            family=name_line.family if name_line else body_family,
            size_pt=name_line.size if name_line else body_pt + 9,
            bold=True,
            color=name_line.color if name_line else body_color,
        ),
        section_heading=FontSpec(
            family=heading.family if heading else body_family,
            size_pt=heading.size if heading else body_pt + 1.5,
            bold=True,
            color=heading.color if heading else body_color,
        ),
        entry_heading=FontSpec(family=body_family, size_pt=body_pt + 0.5, bold=True),
        heading_transform="upper" if len(upper) >= 2 else "none",
        # Two or more hairlines means the design underlines its headings.
        heading_rule=rules >= 2,
        line_spacing=_line_spacing(lines, body_pt),
        bullet_glyph=_bullet_glyph(lines),
        accent_color=accent,
        inferred=True,
    )


def _line_spacing(lines: list[_Line], body_pt: float) -> float:
    """Median baseline-to-baseline distance, as a multiple of type size."""
    by_page: dict[int, list[float]] = {}
    for line in lines:
        by_page.setdefault(line.page, []).append(line.top)

    gaps: list[float] = []
    for tops in by_page.values():
        ordered = sorted(tops, reverse=True)
        # Gaps wider than three times the type size are section breaks, not
        # line spacing, and would skew the median.
        gaps.extend(a - b for a, b in pairwise(ordered) if 0 < a - b < body_pt * 3)
    if not gaps:
        return 1.15
    return round(max(1.0, min(2.0, statistics.median(gaps) / body_pt)), 2)


def _bullet_glyph(lines: list[_Line]) -> str:
    glyphs = Counter(ln.text[0] for ln in lines if ln.text and ln.text[0] in "•▪◦‣∙·●○◆■□-–—*")
    return glyphs.most_common(1)[0][0] if glyphs else "•"
