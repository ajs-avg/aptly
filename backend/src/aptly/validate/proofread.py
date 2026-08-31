"""Reading a CV for the mistakes a person is embarrassed to have sent.

Deliberately not a model. Every check here is deterministic, runs in a
millisecond, costs nothing and cannot hallucinate a problem that is not there —
which matters more than it sounds, because a proofreader that cries wolf is one
people stop reading, and then it catches nothing at all.

That constraint decides what belongs. Anything requiring judgement about
*meaning* is out; anything a careful reader would catch by looking is in. So
there is no spell-checker: without a dictionary that knows every company,
product and framework a CV can mention, it would flag "Kubernetes", "Zomato" and
the person's own surname, and the real typo would be lost in the noise.

What is left is the class of error that is unambiguous and quietly fatal — dates
that run backwards, a phone number that lost a digit, "the the", a placeholder
somebody forgot to replace. None of them are hard to see once pointed at, and
all of them are routinely sent.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from aptly.model.document import CVDocument

Severity = Literal["error", "warning", "polish"]


@dataclass(frozen=True, slots=True)
class Finding:
    """One thing worth looking at before this is sent."""

    #: `error` is wrong and will be noticed. `warning` is probably wrong.
    #: `polish` is inconsistent rather than incorrect.
    severity: Severity
    #: A stable slug, so the UI can group and the tests can name one.
    kind: str
    message: str
    #: What to do about it. Never just "this is wrong".
    hint: str
    #: The node this is about, where there is one. Lets the UI scroll to it.
    node_id: str | None = None
    #: The offending text, quoted, so the person can find it by eye.
    quote: str = ""


# ═══════════════════════════════════════════════════════════════════════════
# Dates
# ═══════════════════════════════════════════════════════════════════════════

_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

_PRESENT = re.compile(r"\b(present|current|now|ongoing|to date)\b", re.IGNORECASE)

#: The ways a CV writes one month. Named, because the *mixture* is the finding.
_STYLES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Mon YYYY", re.compile(r"^[A-Za-z]{3,9}\.?\s+\d{4}$")),
    ("MM/YYYY", re.compile(r"^\d{1,2}/\d{4}$")),
    ("YYYY-MM", re.compile(r"^\d{4}-\d{1,2}$")),
    ("YYYY", re.compile(r"^\d{4}$")),
)


#: A date as it appears inside a line, for spotting a mixture of styles that
#: the entry parser never got far enough to compare.
_DATE_TOKEN = re.compile(r"\b(?:[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}/\d{4}|\d{4}-\d{1,2})\b")


def _month_index(text: str) -> int | None:
    """A date as months-since-year-zero, for comparing two of them."""
    value = text.strip().lower().rstrip(".")
    if not value or _PRESENT.search(value):
        return None

    if match := re.match(r"^([a-z]{3,9})\.?\s+(\d{4})$", value):
        month = _MONTHS.get(match.group(1)[:3])
        return int(match.group(2)) * 12 + month if month else None
    if match := re.match(r"^(\d{1,2})/(\d{4})$", value):
        return int(match.group(2)) * 12 + int(match.group(1))
    if match := re.match(r"^(\d{4})-(\d{1,2})$", value):
        return int(match.group(1)) * 12 + int(match.group(2))
    if match := re.match(r"^(\d{4})$", value):
        return int(match.group(1)) * 12
    return None


def _style_of(text: str) -> str | None:
    value = text.strip()
    for name, pattern in _STYLES:
        if pattern.match(value):
            return name
    return None


def _check_dates(document: CVDocument) -> list[Finding]:
    findings: list[Finding] = []
    styles: dict[str, str] = {}
    now = datetime.now(UTC)
    this_month = now.year * 12 + now.month

    for section in document.sections:
        for entry in section.entries:
            start, end = (entry.start or "").strip(), (entry.end or "").strip()
            where = " · ".join(part for part in (entry.role, entry.org) if part)

            first, last = _month_index(start), _month_index(end)

            if first is not None and last is not None and last < first:
                findings.append(
                    Finding(
                        severity="error",
                        kind="dates_reversed",
                        message=f"{where or 'An entry'} ends before it starts.",
                        hint=f"“{start}” to “{end}”. One of the two is wrong.",
                        quote=f"{start} – {end}",
                    )
                )

            # A start in the future is a typo in the year, every time.
            if first is not None and first > this_month + 1:
                findings.append(
                    Finding(
                        severity="error",
                        kind="date_in_future",
                        message=f"{where or 'An entry'} starts in the future.",
                        hint=f"“{start}” is after today. Check the year.",
                        quote=start,
                    )
                )

            for value in (start, end):
                if style := _style_of(value):
                    styles.setdefault(style, value)

    for node in document.nodes:
        for token in _DATE_TOKEN.findall(node.text):
            if style := _style_of(token):
                styles.setdefault(style, token)

    # Two ways of writing a date on one CV reads as two documents glued
    # together. It is the most common inconsistency and the easiest to miss,
    # because each date looks right on its own.
    dated = {name: example for name, example in styles.items() if name != "YYYY"}
    if len(dated) > 1:
        shown = ", ".join(f"“{example}”" for example in dated.values())
        findings.append(
            Finding(
                severity="polish",
                kind="date_styles_mixed",
                message="Dates are written more than one way.",
                hint=f"{shown}. Pick one and use it throughout.",
            )
        )

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# Contact details
# ═══════════════════════════════════════════════════════════════════════════

_EMAIL_OK = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
#: Something the person clearly meant as an address, valid or not.
_EMAIL_ISH = re.compile(r"\S+@\S+")
#: A run of digits and phone punctuation, long enough to be an attempt.
_PHONE_ISH = re.compile(r"(?:\+?\d[\d\s().-]{4,}\d)")


def _header_text(document: CVDocument) -> str:
    """The top of the CV as written, before the parser filtered it.

    Read instead of `document.contact`, because the parser's contact fields are
    the ones it could *validate*: an email with no top-level domain and a phone
    number missing three digits are both discarded on the way in, and arrive
    here as `None`. Reading them as "there is no email on this CV" would send
    somebody looking for a line that is right there in front of them, with a
    typo in it — which is exactly the finding worth making.
    """
    for section in document.sections:
        if section.kind == "header":
            return "\n".join(node.text for node in section.nodes)
    return ""


def _check_contact(document: CVDocument) -> list[Finding]:
    findings: list[Finding] = []
    contact = document.contact
    header = _header_text(document)

    if contact.email:
        pass  # Parsed and valid; the parser only keeps well-formed addresses.
    elif attempt := _EMAIL_ISH.search(header):
        findings.append(
            Finding(
                severity="error",
                kind="email_malformed",
                message="That email address is not complete.",
                hint=f"“{attempt.group(0)}” — check for a missing domain, like .com.",
                quote=attempt.group(0),
            )
        )
    else:
        findings.append(
            Finding(
                severity="error",
                kind="no_email",
                message="There is no email address on this CV.",
                hint="An employer who wants to reply has no way to.",
            )
        )

    if contact.phone:
        digits = sum(character.isdigit() for character in contact.phone)
        if digits < 10:
            findings.append(
                Finding(
                    severity="warning",
                    kind="phone_short",
                    message="That phone number looks short.",
                    hint=f"“{contact.phone}” has {digits} digits. A dropped one is easy to miss.",
                    quote=contact.phone,
                )
            )
    elif attempt := _PHONE_ISH.search(header):
        digits = sum(character.isdigit() for character in attempt.group(0))
        if 4 <= digits < 10:
            findings.append(
                Finding(
                    severity="error",
                    kind="phone_short",
                    message="That phone number is missing digits.",
                    hint=f"“{attempt.group(0).strip()}” has only {digits}.",
                    quote=attempt.group(0).strip(),
                )
            )

    if not contact.name:
        findings.append(
            Finding(
                severity="warning",
                kind="no_name",
                message="No name was found at the top.",
                hint="Aptly reads the first line as the name. Check it is there.",
            )
        )

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# The text itself
# ═══════════════════════════════════════════════════════════════════════════

#: Left in by accident, and instantly disqualifying.
_PLACEHOLDERS = re.compile(
    r"\b(lorem ipsum|insert\s+\w+\s+here|your\s+name\s+here|tbd|todo|xxx+|"
    r"n/?a\b|to be (added|filled|completed)|\[.{0,30}\]|<.{0,30}>)",
    re.IGNORECASE,
)

#: "the the", "and and". Written once and read past a hundred times.
_DOUBLED = re.compile(r"\b(\w+)\s+\1\b", re.IGNORECASE)

#: Markdown that survived a paste. Should be stripped at ingest; this is the
#: backstop that says so out loud rather than shipping it.
_MARKDOWN = re.compile(r"(^#{1,6}\s)|(\*\*)|(`)|(\]\()")

_SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+[,.;:!?]")

#: A word repeated legitimately. "had had" is grammatical; so is a company
#: called "Yahoo Yahoo". Short and hand-picked rather than clever.
_DOUBLE_OK = {"had", "that", "is"}


def _check_text(document: CVDocument) -> list[Finding]:
    findings: list[Finding] = []
    endings: dict[bool, str] = {}

    for node in document.nodes:
        text = node.text.strip()
        if not text:
            continue

        if match := _PLACEHOLDERS.search(text):
            findings.append(
                Finding(
                    severity="error",
                    kind="placeholder",
                    message="A placeholder is still in the text.",
                    hint=f"“{match.group(0)}” — replace it or delete the line.",
                    node_id=node.id,
                    quote=text[:100],
                )
            )

        if (match := _DOUBLED.search(text)) and match.group(1).lower() not in _DOUBLE_OK:
            findings.append(
                Finding(
                    severity="error",
                    kind="doubled_word",
                    message=f"“{match.group(1)}” is written twice in a row.",
                    hint=f"In: “{text[:80]}”",
                    node_id=node.id,
                    quote=match.group(0),
                )
            )

        if _MARKDOWN.search(text):
            findings.append(
                Finding(
                    severity="warning",
                    kind="markdown_left_in",
                    message="Formatting characters are showing as text.",
                    hint="Symbols like ** or ## will print literally on the CV.",
                    node_id=node.id,
                    quote=text[:100],
                )
            )

        if _SPACE_BEFORE_PUNCTUATION.search(text):
            findings.append(
                Finding(
                    severity="polish",
                    kind="space_before_punctuation",
                    message="There is a space before a comma or full stop.",
                    hint=f"In: “{text[:80]}”",
                    node_id=node.id,
                )
            )

        if "  " in text:
            findings.append(
                Finding(
                    severity="polish",
                    kind="double_space",
                    message="Two spaces in the middle of a line.",
                    hint=f"In: “{text[:80]}”",
                    node_id=node.id,
                )
            )

        # Bullets that mostly end in a full stop, with a few that do not, look
        # unfinished rather than deliberate. Only bullets, and only where there
        # are enough of them for a convention to exist.
        if node.role == "bullet" and len(text) > 20:
            endings.setdefault(text.endswith("."), text)

    if len(endings) == 2:
        findings.append(
            Finding(
                severity="polish",
                kind="bullet_punctuation_mixed",
                message="Some bullets end in a full stop and some do not.",
                hint="Either is fine. Both together looks unfinished.",
            )
        )

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# Duties, where achievements belong
#
# The most-repeated advice about CVs, and the one thing a checker can genuinely
# help with: "responsible for managing social media" says what the job was,
# "grew engagement 35%" says what the person did. Aptly cannot turn one into the
# other — it has no evidence for the number — but it can say which bullets are
# missing one, which is what sends somebody to their career profile to supply it.
# ═══════════════════════════════════════════════════════════════════════════

#: Openings that describe a job description rather than a person.
_DUTY_OPENING = re.compile(
    r"^\s*(responsible for|helped (with|to)|assisted (with|in)|worked on|"
    r"participated in|involved in|duties included|tasked with|in charge of|"
    r"contributed to)\b",
    re.IGNORECASE,
)

#: Any figure a reader would register as a result.
_HAS_NUMBER = re.compile(r"\d|\b(doubled|tripled|halved|first|only)\b", re.IGNORECASE)


def _check_achievements(document: CVDocument) -> list[Finding]:
    findings: list[Finding] = []
    bullets = [node for node in document.nodes if node.role == "bullet"]
    if not bullets:
        return findings

    for node in bullets:
        if match := _DUTY_OPENING.match(node.text):
            findings.append(
                Finding(
                    severity="warning",
                    kind="duty_not_achievement",
                    message=f"“{match.group(0).strip()}” describes the job, not what you did.",
                    hint=(
                        "Say what changed because you were there. Aptly cannot add "
                        "the result for you — it may only use what you have told it."
                    ),
                    node_id=node.id,
                    quote=node.text[:100],
                )
            )

    # The whole-CV version, which is the one that actually moves somebody: a
    # single flagged bullet reads as nitpicking, "three of fourteen" reads as a
    # problem with the document.
    quantified = sum(1 for node in bullets if _HAS_NUMBER.search(node.text))
    if len(bullets) >= 4 and quantified * 3 < len(bullets):
        findings.append(
            Finding(
                severity="warning",
                kind="few_numbers",
                message=f"Only {quantified} of {len(bullets)} bullets carry a number.",
                hint=(
                    "Scale, money, time, headcount, percentages. Add them to your "
                    "career profile and every tailored CV can use them."
                ),
            )
        )

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# Length
#
# More is not better. A recruiter spends seconds on a first pass, and the
# qualification that wins the interview is the one they did not have to scroll
# to find.
# ═══════════════════════════════════════════════════════════════════════════

#: Words a CV page holds at a readable size, with headings and white space.
_WORDS_PER_PAGE = 500
#: A bullet longer than this is a paragraph pretending to be one.
_LONG_BULLET_WORDS = 45


def _check_length(document: CVDocument) -> list[Finding]:
    findings: list[Finding] = []
    words = document.word_count
    pages = words / _WORDS_PER_PAGE

    if pages > 2.4:
        findings.append(
            Finding(
                severity="warning",
                kind="too_long",
                message=f"This is around {pages:.1f} pages.",
                hint=(
                    "Two is the usual ceiling. Cut the oldest roles to a line each "
                    "before cutting anything recent."
                ),
            )
        )

    for node in document.nodes:
        if node.role != "bullet":
            continue
        count = len(node.text.split())
        if count > _LONG_BULLET_WORDS:
            findings.append(
                Finding(
                    severity="polish",
                    kind="bullet_too_long",
                    message=f"One bullet runs to {count} words.",
                    hint="A bullet is skimmed, not read. Split it, or cut it to the result.",
                    node_id=node.id,
                    quote=node.text[:100],
                )
            )

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# Details that do not belong on a CV any more
#
# Unambiguous, which is why it is safe to check for mechanically. Most employers
# outside a handful of countries ask candidates *not* to send these, and several
# create a legal problem for the person reading them — so a CV carrying them is
# sometimes discarded before anybody assesses it.
# ═══════════════════════════════════════════════════════════════════════════

_PERSONAL = (
    ("date_of_birth", re.compile(r"\b(date of birth|d\.?o\.?b\.?)\b", re.I), "Date of birth"),
    ("marital_status", re.compile(r"\bmarital status\b", re.I), "Marital status"),
    ("family", re.compile(r"\b(father'?s|mother'?s|spouse'?s) name\b", re.I), "A parent's name"),
    ("gender", re.compile(r"^\s*(gender|sex)\s*[:\-]", re.I | re.M), "Gender"),
    ("religion", re.compile(r"\b(religion|caste|nationality)\s*[:\-]", re.I), "Religion or caste"),
    ("photo", re.compile(r"\b(passport size|attach(ed)? photo|photograph)\b", re.I), "A photo"),
)


def _check_personal(document: CVDocument) -> list[Finding]:
    findings: list[Finding] = []
    text = document.plain_text()

    for kind, pattern, label in _PERSONAL:
        if pattern.search(text):
            findings.append(
                Finding(
                    severity="warning",
                    kind=f"personal_{kind}",
                    message=f"{label} is on this CV.",
                    hint=(
                        "Most employers ask you to leave this out, and in several "
                        "countries reading it creates a problem for them. It takes "
                        "space from something that would help you."
                    ),
                )
            )

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# All of it
# ═══════════════════════════════════════════════════════════════════════════

#: Worst first, so the list reads in the order somebody should act on it.
_ORDER: dict[Severity, int] = {"error": 0, "warning": 1, "polish": 2}


def proofread(document: CVDocument) -> list[Finding]:
    """Every mechanical mistake in this CV, worst first.

    Returns an empty list for a clean document, which is a real answer and worth
    showing: "nothing to fix" is the thing somebody wants to hear before they
    press send.
    """
    findings = [
        *_check_contact(document),
        *_check_dates(document),
        *_check_text(document),
        *_check_achievements(document),
        *_check_length(document),
        *_check_personal(document),
    ]
    findings.sort(key=lambda finding: _ORDER[finding.severity])
    return findings


__all__ = ["Finding", "Severity", "proofread"]
