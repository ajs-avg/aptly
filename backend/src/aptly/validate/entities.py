"""Pulling checkable facts out of a sentence.

A rewrite is safe when everything *checkable* in it already existed in the
person's own material. This module decides what counts as checkable.

Three classes of token, in descending order of how dangerous it is to invent one:

**Figures.** A number is the most damaging thing a CV tool can invent, and the
easiest to catch. "Grew signups from 900 to 4,100" must not become "to 5,000".

**Proper nouns.** Employers, products, clients, certifications. You cannot have
worked at a company you did not work at, so an unsourced capitalised name is
always a rejection.

**Technical tokens.** Names that ordinary capitalisation rules miss — ``C++``,
``K8s``, ``.NET``, ``gRPC``. A CV that claims a tool the person has never used
fails in the first technical screen.

Ordinary vocabulary is deliberately *not* checked. Rephrasing is the entire
point of the product; only claims are policed.
"""

from __future__ import annotations

import re

# ── figures ─────────────────────────────────────────────────────────────────

_NUMBER = re.compile(r"\d[\d,.]*\s*(?:%|percent|k\b|m\b|bn\b|b\b)?", re.IGNORECASE)

#: Number words that mean exactly the same as a figure, so converting between
#: them is faithful restatement rather than invention. "Cut it by half" may
#: become "cut it by 50%"; it may not become "cut it by 60%".
_WORD_FIGURES: dict[str, set[str]] = {
    "one": {"1"},
    "two": {"2"},
    "three": {"3"},
    "four": {"4"},
    "five": {"5"},
    "six": {"6"},
    "seven": {"7"},
    "eight": {"8"},
    "nine": {"9"},
    "ten": {"10"},
    "eleven": {"11"},
    "twelve": {"12"},
    "fifteen": {"15"},
    "twenty": {"20"},
    "thirty": {"30"},
    "forty": {"40"},
    "fifty": {"50"},
    "sixty": {"60"},
    "seventy": {"70"},
    "eighty": {"80"},
    "ninety": {"90"},
    "hundred": {"100"},
    "thousand": {"1000"},
    "million": {"1000000"},
    "half": {"50", "50%"},
    "quarter": {"25", "25%"},
    "third": {"33", "33%"},
    "double": {"2", "100%"},
    "triple": {"3", "200%"},
}


def figures(text: str) -> set[str]:
    """Every quantity in ``text``, normalised so 1,200 and 1200 compare equal."""
    found = {_normalise_figure(match.group()) for match in _NUMBER.finditer(text)}
    lowered = text.lower()
    for word, equivalents in _WORD_FIGURES.items():
        if re.search(rf"\b{word}\b", lowered):
            found |= {_normalise_figure(value) for value in equivalents}
    return {value for value in found if value}


def _normalise_figure(raw: str) -> str:
    cleaned = raw.lower().strip().replace(",", "").replace(" ", "")
    cleaned = cleaned.replace("percent", "%")
    if cleaned.endswith("."):
        cleaned = cleaned[:-1]
    # Trailing zeros after a decimal point carry no meaning: 4.0 == 4.
    if "." in cleaned:
        head, _, tail = cleaned.partition(".")
        suffix = "".join(ch for ch in tail if not ch.isdigit())
        digits = tail[: len(tail) - len(suffix)].rstrip("0")
        cleaned = f"{head}.{digits}{suffix}" if digits else f"{head}{suffix}"
    return cleaned


# ── proper nouns ────────────────────────────────────────────────────────────

#: Words that are capitalised for grammatical reasons rather than because they
#: name something. Without these, every sentence-initial "The" is a fabrication.
_NOT_NAMES = frozenset(
    [
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "if",
        "then",
        "than",
        "that",
        "this",
        "these",
        "those",
        "there",
        "their",
        "they",
        "them",
        "i",
        "we",
        "you",
        "he",
        "she",
        "it",
        "his",
        "her",
        "our",
        "your",
        "its",
        "my",
        "me",
        "us",
        "in",
        "on",
        "at",
        "by",
        "for",
        "with",
        "from",
        "into",
        "over",
        "under",
        "across",
        "through",
        "during",
        "before",
        "after",
        "to",
        "of",
        "as",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "am",
        "do",
        "does",
        "did",
        "done",
        "have",
        "has",
        "had",
        "will",
        "would",
        "can",
        "could",
        "should",
        "shall",
        "may",
        "might",
        "must",
        "not",
        "no",
        "nor",
        "so",
        "such",
        "led",
        "ran",
        "built",
        "made",
        "grew",
        "cut",
        "set",
        "won",
        "owned",
        "drove",
        "took",
        "gave",
        "used",
        "ship",
        "shipped",
        "delivered",
        "designed",
        "created",
        "improved",
        "reduced",
        "increased",
        "launched",
        "managed",
        "worked",
        "developed",
        "introduced",
        "replaced",
        "rebuilt",
        "migrated",
        "automated",
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun",
        "present",
        "current",
        "now",
        "team",
        "teams",
    ]
)

_WORD = re.compile(r"[A-Za-z][\w''\-&.+#]*")
_SENTENCE_START = re.compile(r"(?:^|[.!?:;•\-–—]\s+|\n)\s*$")


def proper_nouns(text: str) -> set[str]:
    """Capitalised names, excluding those capitalised only by position."""
    found: set[str] = set()
    for match in _WORD.finditer(text):
        word = match.group()
        if not word[0].isupper() or word.lower() in _NOT_NAMES:
            continue
        # A capital at the start of a sentence proves nothing.
        if _SENTENCE_START.search(text[: match.start()]):
            continue
        if len(word) == 1:
            continue
        found.add(_fold(word))
    return found


# ── technical tokens ────────────────────────────────────────────────────────

#: Shapes that name a technology regardless of capitalisation: C++, K8s, .NET,
#: Node.js, CI/CD, S3, gRPC, PostgreSQL, IPv6.
_TECHNICAL = re.compile(
    r"""
    (?:[A-Za-z][A-Za-z.]*\+\+)          # C++
  | (?:\.[A-Za-z]{2,})                  # .NET
  | (?:[A-Za-z]+\.[a-z]{2,}\b)          # Node.js
  | (?:[A-Za-z]+/[A-Za-z]+)             # CI/CD
  | (?:[A-Za-z]+\d+[A-Za-z]*)           # S3, K8s, IPv6
  | (?:[A-Z]{2,}[a-z]*[A-Z]\w*)         # gRPC, PostgreSQL, GraphQL
  | (?:\b[A-Z]{2,}\b)                   # SQL, AWS, ETL
    """,
    re.VERBOSE,
)


def technical_tokens(text: str) -> set[str]:
    return {_fold(match.group()) for match in _TECHNICAL.finditer(text) if len(match.group()) > 1}


# ── shared ──────────────────────────────────────────────────────────────────


def _fold(token: str) -> str:
    """Casefold and strip trailing punctuation so tokens compare fairly."""
    return token.lower().strip(".,;:!?()[]{}'\"")


#: Words that carry no information about the person — grammar, and the padding
#: that good tightening is supposed to remove. Dropping these is the *point* of
#: a rewrite; dropping anything else is losing content.
_FILLER = frozenset(
    [
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "of",
        "to",
        "in",
        "on",
        "at",
        "by",
        "for",
        "with",
        "from",
        "into",
        "over",
        "under",
        "across",
        "through",
        "during",
        "before",
        "after",
        "as",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "am",
        "do",
        "does",
        "did",
        "done",
        "have",
        "has",
        "had",
        "will",
        "would",
        "can",
        "could",
        "should",
        "shall",
        "may",
        "might",
        "must",
        "not",
        "no",
        "nor",
        "so",
        "such",
        "very",
        "really",
        "quite",
        "various",
        "several",
        "many",
        "some",
        "more",
        "most",
        "other",
        "responsible",
        "tasked",
        "involved",
        "helped",
        "assisted",
        "worked",
        "working",
        "participated",
        "contributed",
        "supported",
        "utilised",
        "utilized",
        "leveraged",
        "including",
        "etc",
        "also",
        "both",
        "that",
        "this",
        "these",
        "those",
        "which",
        "who",
        "whom",
        "whose",
        "it",
        "its",
        "their",
        "there",
        "here",
        "when",
        "while",
        "where",
        "what",
        "how",
        "why",
        "all",
        "any",
        "each",
        "every",
        "own",
        "same",
        "then",
        "just",
        "about",
    ]
)


def content_words(text: str) -> set[str]:
    """The words that carry meaning, ignoring grammar and CV padding.

    Used to notice a rewrite that has quietly become *vaguer*: "Frontend
    developer building customer-facing web applications" shortened to
    "Developer building applications" invents nothing and drops no number, so
    every other check passes — but the person now sounds less specific than
    they are, which is the opposite of tailoring.
    """
    return {
        _fold(match.group())
        for match in _WORD.finditer(text)
        if len(match.group()) > 2 and _fold(match.group()) not in _FILLER
    }


def vocabulary(text: str) -> set[str]:
    """Every word the person used, regardless of where it sat in a sentence.

    This is the *source* side of the check, and it is deliberately permissive
    where :func:`proper_nouns` is strict. Those two functions answer different
    questions, and conflating them caused a whole class of false accusations:

        "Web Development: HTML5, CSS3, JavaScript"

    ``proper_nouns`` skips "HTML5" here, because a capital straight after a
    colon proves nothing about whether a word is a name. But a suggestion that
    then used "HTML5" mid-sentence *was* counted as a name — one absent from the
    source set — and the rewrite was rejected as an invention of a technology
    the person had plainly listed.

    The question that actually matters is simply "did they mention this?", so
    the source keeps every token and the candidate side stays strict about which
    tokens count as a claim.
    """
    return {_fold(match.group()) for match in _WORD.finditer(text) if len(match.group()) > 1}


def claims(text: str) -> tuple[set[str], set[str], set[str]]:
    """The three checkable sets for one piece of text."""
    return figures(text), proper_nouns(text), technical_tokens(text)


#: Re-exported so other layers can share one definition of 'carries no
#: information about the person' rather than each keeping their own list.
FILLER = _FILLER
