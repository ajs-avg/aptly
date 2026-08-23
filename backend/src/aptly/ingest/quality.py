"""How much of the document did the ordinary parser actually get?

A PDF can be read as a text stream almost for free, or as pages of pixels by a
multimodal model for roughly ten times the cost and several seconds of latency.
Which one is right depends entirely on whether the cheap path worked — and the
cheap path fails *quietly*. A scanned CV yields no text at all; a subset font
with a broken encoding yields a page of dropped glyphs; a heavily-designed
layout shreds into fragments that are individually legible and collectively
meaningless.

None of those raise. They return a :class:`CVDocument` that looks structurally
fine and is missing most of the person. So this module scores the result and the
caller escalates to vision when the score is poor.

The score is deliberately made of blunt, explainable signals rather than a
learned classifier: every penalty carries the sentence that justifies it, and
those sentences are what the user is shown when a rebuild happens.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from aptly.model.document import CVDocument

#: Characters of real text a single CV page carries. A dense page runs to about
#: 3,500; anything under this is not a page of prose, whatever it looks like.
_SPARSE_PAGE = 600
_NEARLY_EMPTY_PAGE = 250

#: Below this, the parse is treated as untrustworthy enough to pay for vision.
#: Not a constant anyone should tune casually — it is compared against
#: ``Settings.vision_fallback_below``, which is the knob.
DEFAULT_THRESHOLD = 0.62

_VOWELS = frozenset("aeiouyAEIOUY")
_CID = re.compile(r"\(cid:\d+\)")
_WORDISH = re.compile(r"[A-Za-z]{2,}")


@dataclass(slots=True)
class ExtractionQuality:
    """A verdict on one parse, with its reasoning intact."""

    score: float
    reasons: list[str] = field(default_factory=list)

    def needs_vision(self, threshold: float = DEFAULT_THRESHOLD) -> bool:
        """Is this parse bad enough to be worth re-reading with a vision model?

        A threshold of zero disables the fallback, which is how an operator
        turns the extra cost off entirely.
        """
        return threshold > 0 and self.score < threshold


def assess_extraction(
    document: CVDocument,
    *,
    pages: int | None = None,
    raw_text: str | None = None,
) -> ExtractionQuality:
    """Score how completely ``document`` represents the file it came from.

    ``raw_text`` is the extractor's output *before* glyph cleanup, when the
    caller has it. Unmapped ``(cid:N)`` markers are the clearest single sign of
    a broken font encoding, and they are gone by the time the document exists.
    """
    nodes = document.nodes
    if not nodes:
        return ExtractionQuality(
            0.0,
            ["No selectable text was found at all — this looks like a scanned or image-only file."],
        )

    text = document.plain_text()
    reasons: list[str] = []
    score = 1.0

    # ── Density ──────────────────────────────────────────────────────────
    # The single most reliable signal. Vision is worth paying for exactly when
    # there is a document on the page and almost none of it came through.
    page_count = max(pages or 1, 1)
    per_page = len(text) / page_count
    if per_page < _NEARLY_EMPTY_PAGE:
        score -= 0.5
        reasons.append(
            f"Only {int(per_page)} characters of text per page were recovered — "
            "far less than a CV page holds."
        )
    elif per_page < _SPARSE_PAGE:
        score -= 0.2
        reasons.append(
            f"Only {int(per_page)} characters per page were recovered, which is sparse for a CV."
        )

    # ── Font encoding ────────────────────────────────────────────────────
    if raw_text:
        cid_chars = sum(len(match.group()) for match in _CID.finditer(raw_text))
        if cid_chars and cid_chars / max(len(raw_text), 1) > 0.02:
            score -= 0.3
            reasons.append(
                "The fonts use a private encoding, so some characters could not be decoded."
            )

    # ── Is it words? ─────────────────────────────────────────────────────
    likeness = _word_likeness(text)
    if likeness < 0.55:
        score -= 0.35
        reasons.append("Most of the recovered text does not read as words.")
    elif likeness < 0.75:
        score -= 0.15
        reasons.append("Some of the recovered text does not read as words.")

    # ── Did it come out as a document? ───────────────────────────────────
    # A CV that produced no recognisable section heading was almost certainly
    # read as a flat wall of text, whatever its character count says.
    recognised = [s for s in document.sections if s.kind not in {"custom", "header"}]
    if not recognised:
        score -= 0.2
        reasons.append("No standard CV sections could be identified.")

    # A line-per-fragment parse looks fine by volume and is useless to work on.
    lengths = [len(node.text.strip()) for node in nodes if node.text.strip()]
    if lengths and sum(lengths) / len(lengths) < 12:
        score -= 0.2
        reasons.append("The text came out in fragments rather than whole lines.")

    # ── Who is this? ─────────────────────────────────────────────────────
    contact = document.contact
    if not contact.email and not contact.phone:
        score -= 0.15
        reasons.append("No email address or phone number was found.")

    return ExtractionQuality(score=max(0.0, min(1.0, score)), reasons=reasons)


def _word_likeness(text: str) -> float:
    """Fraction of alphabetic tokens that plausibly are words.

    A vowel is the cheap test, with a carve-out for the short all-consonant
    acronyms a CV is genuinely full of — SQL, AWS, HTML, PHP, NHS. Text from a
    mis-decoded font fails both.
    """
    tokens = _WORDISH.findall(text)
    if not tokens:
        return 0.0
    good = sum(
        1
        for token in tokens
        if any(char in _VOWELS for char in token) or (len(token) <= 4 and token.isupper())
    )
    return good / len(tokens)


__all__ = ["DEFAULT_THRESHOLD", "ExtractionQuality", "assess_extraction"]
