"""Section and entry detection.

Every parser produces lines; this module decides which of those lines are
section headings, what kind of section they open, and where one job ends and
the next begins. Keeping the heuristics in one place means .docx, .pdf, .tex and
.txt all classify a CV the same way — so a person who uploads the same CV in two
formats sees the same suggestions.

Deliberately conservative: when a line is ambiguous we treat it as content. A
missed heading costs a slightly flatter structure; a false heading splits
someone's job history in half.
"""

from __future__ import annotations

import re

from aptly.model.document import SectionKind

# ── heading vocabulary ──────────────────────────────────────────────────────
# Ordered longest-phrase-first within each kind so "work experience" wins over
# a bare "experience" appearing inside it.

_HEADING_VOCAB: list[tuple[SectionKind, tuple[str, ...]]] = [
    (
        "experience",
        (
            "professional experience",
            "work experience",
            "employment history",
            "career history",
            "relevant experience",
            # Graduate and early-career CVs, which are a large share of the
            # people this product is for, almost never say plain "Experience".
            "internship experience",
            "internships",
            "internship",
            "industry experience",
            "professional background",
            "experience",
            "employment",
            "work history",
        ),
    ),
    (
        "education",
        (
            "education and training",
            "academic qualifications",
            "academic background",
            "academic details",
            "education",
            "qualifications",
        ),
    ),
    (
        "skills",
        (
            "technical skills",
            "core competencies",
            "key skills",
            "skills and expertise",
            "areas of expertise",
            "skills",
            "competencies",
            "technologies",
            "tech stack",
        ),
    ),
    (
        "summary",
        (
            "professional summary",
            "personal statement",
            "career objective",
            "executive summary",
            "about me",
            "summary",
            "profile",
            "objective",
            "about",
        ),
    ),
    (
        "projects",
        (
            "selected projects",
            "academic projects",
            "personal projects",
            "key projects",
            "major projects",
            "project work",
            "projects",
            "portfolio",
        ),
    ),
    (
        "certifications",
        (
            "certifications and licenses",
            "certifications and courses",
            "certifications",
            "certificates",
            "licenses",
            "courses",
            "training",
        ),
    ),
    ("publications", ("publications", "papers", "research", "patents")),
    (
        "awards",
        (
            "awards and honors",
            "awards and honours",
            "accomplishments",
            "achievements",
            "awards",
            "honors",
            "honours",
        ),
    ),
    ("languages", ("languages",)),
    # Sidebar layouts label the contact block explicitly; without this the
    # details underneath get read as content.
    ("header", ("contact", "contact details", "contact information", "details", "get in touch")),
    (
        "volunteering",
        (
            "positions of responsibility",
            "volunteer experience",
            "community involvement",
            "extracurricular",
            "volunteering",
            "leadership",
        ),
    ),
    ("interests", ("interests", "hobbies", "activities", "personal interests")),
]

#: Longest first so multi-word headings match before their single-word prefixes.
_FLAT_VOCAB: list[tuple[str, SectionKind]] = sorted(
    ((phrase, kind) for kind, phrases in _HEADING_VOCAB for phrase in phrases),
    key=lambda pair: -len(pair[0]),
)

_HEADING_NOISE = re.compile(r"[^a-z& ]+")

# ── date ranges, used to spot the start of a new job entry ──────────────────

_MONTHS = (
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
)
_YEAR = r"(?:19|20)\d{2}"
_DATE_POINT = rf"(?:(?:{_MONTHS})[a-z]*\.?\s*)?{_YEAR}"
_PRESENT = r"present|current|now|ongoing|date"

DATE_RANGE = re.compile(
    rf"\b({_DATE_POINT})\s*(?:-|–|—|to|until|through)\s*({_DATE_POINT}|{_PRESENT})\b",
    re.IGNORECASE,
)

BULLET_PREFIX = re.compile(r"^\s*(?:[•▪◦‣∙·※‧⁃∘●○◆■□➤➢»–—\-\*\+]|\d{1,2}[.)])\s+")

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
PHONE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
URL = re.compile(r"(?:https?://|www\.)[^\s,;]+|(?:linkedin\.com|github\.com)/[^\s,;]+", re.I)


#: "Languages: JavaScript, TypeScript" — a label, a colon, then real content.
#: Distinguished from "EXPERIENCE:", where the colon ends the line.
_LABELLED_CONTENT = re.compile(r"^[A-Za-z][A-Za-z /&+-]{1,28}:\s*\S")


def classify_heading(line: str) -> SectionKind | None:
    """Return the section kind this line opens, or None if it is not a heading.

    Matches on the normalised phrase only — the *visual* signals (bold, caps,
    font size) are format-specific and supplied separately by each parser via
    :func:`looks_like_heading`.

    Matching is by *containment*, longest phrase first, not by exact equality.
    Real CVs qualify their headings constantly — "Internship Experience", "Key
    Projects", "Relevant Work Experience", "Academic Qualifications" — and an
    exact-match table silently files every one of them under "custom". That is
    not cosmetic: the tailoring pass treats the experience section differently
    from everything else, so a missed heading costs the user real quality.
    """
    # A heading is a label. A label with its contents after it is a line of
    # content, and containment matching cannot tell them apart on its own:
    # "Languages: JavaScript, TypeScript, HTML5, CSS3" contains the word
    # "languages", so a skills line was being read as the heading of a Languages
    # section — swallowing the rest of the CV under it. Skill blocks are written
    # this way constantly ("Languages: Python, Java", "Tools: Docker, Git"), so
    # this is not an edge case.
    #
    # A trailing colon with nothing after it is still a heading — "EXPERIENCE:"
    # is common and unambiguous.
    if _LABELLED_CONTENT.match(line.strip()):
        return None

    cleaned = _HEADING_NOISE.sub(" ", line.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned or len(cleaned.split()) > 5:
        return None

    for phrase, kind in _FLAT_VOCAB:
        if cleaned == phrase:
            return kind

    # Longest phrase wins, so "work experience" is not shadowed by "experience".
    for phrase, kind in _FLAT_VOCAB:
        if re.search(rf"\b{re.escape(phrase)}\b", cleaned):
            return kind
    return None


def looks_like_heading(
    line: str,
    *,
    is_bold: bool = False,
    is_larger: bool = False,
    is_upper: bool | None = None,
) -> bool:
    """Visual test for a heading whose words we do not recognise.

    Catches bespoke section names ("What I bring", "Consulting engagements")
    that the vocabulary cannot know about. Requires a visual signal *and* a
    short line, so a bolded sentence inside a bullet does not qualify.
    """
    stripped = line.strip()
    if not stripped or len(stripped.split()) > 5:
        return False
    if BULLET_PREFIX.match(line) or DATE_RANGE.search(stripped):
        return False
    if stripped.endswith((".", ",", ";")):
        return False
    if is_upper is None:
        letters = [c for c in stripped if c.isalpha()]
        is_upper = bool(letters) and all(c.isupper() for c in letters)
    return bool(is_bold or is_larger or is_upper)


def parse_date_range(line: str) -> tuple[str | None, str | None]:
    """Pull a start and end date out of an entry heading line."""
    match = DATE_RANGE.search(line)
    if not match:
        return None, None
    return match.group(1).strip(), match.group(2).strip()


def strip_bullet(line: str) -> str:
    """Remove a leading bullet glyph or list number."""
    return BULLET_PREFIX.sub("", line).strip()


def is_bullet(line: str) -> bool:
    return bool(BULLET_PREFIX.match(line))


def looks_like_entry_heading(line: str) -> bool:
    """Does this line start a new job / degree / project?

    The reliable signal in practice is a date range: CVs put "Mar 2021 – Present"
    on the line that opens an entry far more consistently than they follow any
    particular layout convention.
    """
    stripped = line.strip()
    if not stripped or is_bullet(stripped):
        return False
    # A contact row is separated the same way an entry heading is
    # ("Name | email | phone | city"), so check for contact details first or the
    # header block gets cut short and we lose the person's email.
    if is_contact_line(stripped):
        return False
    if DATE_RANGE.search(stripped):
        return True
    # "Senior Engineer, Acme" / "Senior Engineer at Acme" / "Senior Engineer | Acme".
    # The comma is matched without a leading space — "Engineer, Acme" is how
    # people actually write it, and requiring one missed every such heading.
    if len(stripped.split()) <= 14 and ENTRY_SEPARATOR.search(stripped):
        return not stripped.endswith((".", ";"))
    return False


#: Separators between a role and an employer on one heading line.
ENTRY_SEPARATOR = re.compile(r",\s|\s(?:at|\||·|—|–|-{1,2})\s")


def is_entry_meta(line: str) -> bool:
    """Is this line only the location and dates of the entry above it?

    Layouts that right-align dates emit them as a separate line, which would
    otherwise look like a brand-new job and split one role into two.
    """
    if not DATE_RANGE.search(line):
        return False
    remainder = DATE_RANGE.sub("", line).strip(" ,;|·—–\t")
    return len(remainder.split()) <= 4


#: "Programming:", "Core CS:", "Machine Learning & Data Science:" — a category
#: label introducing the rest of its line. CVs stack these in a skills block.
LABELLED_LINE = re.compile(r"^[A-Z][\w&/+.\- ]{1,34}:\s+\S")


def starts_with_label(line: str) -> bool:
    """Does this line open a new labelled item?

    Skill categories sit flush against each other with no closing punctuation,
    so every wrap heuristic reads them as one continuing sentence and glues the
    whole block into a single unreadable line.
    """
    return bool(LABELLED_LINE.match(line.strip()))


def is_contact_line(line: str) -> bool:
    """Does this line carry contact details rather than content?

    Used to keep the header block intact. A line with an email, a phone number
    or a profile URL is contact information whatever else it looks like.
    """
    if EMAIL.search(line) or URL.search(line):
        return True
    phones = [p for p in PHONE.findall(line) if sum(c.isdigit() for c in p) >= 9]
    return bool(phones)


def split_entry_heading(line: str) -> tuple[str | None, str | None, str | None]:
    """Best-effort split of an entry heading into (role, org, location).

    Returns None for any part we cannot read confidently — a wrong guess here
    would show up on the Recruiter-Ready Card, which must be trustworthy.
    """
    text = DATE_RANGE.sub("", line).strip(" ,;|·—–\t")
    if not text:
        return None, None, None

    # A run of two or more spaces is a separator too: Word documents often set
    # the location with a tab or wide spacing rather than a punctuation mark,
    # which would otherwise leave "Acme Corp    London" as the employer.
    parts = [
        p.strip() for p in re.split(r"\s*(?:\||·|—|–|,|\bat\b)\s*|\s{2,}", text) if p and p.strip()
    ]
    if not parts:
        return None, None, None
    if len(parts) == 1:
        return parts[0], None, None
    if len(parts) == 2:
        return parts[0], parts[1], None
    return parts[0], parts[1], parts[-1]


def extract_contact_bits(text: str) -> dict[str, object]:
    """Pull email, phone and links out of the top of a CV."""
    emails = EMAIL.findall(text)
    phones = [p.strip() for p in PHONE.findall(text) if sum(c.isdigit() for c in p) >= 9]
    links = URL.findall(text)
    return {
        "email": emails[0] if emails else None,
        "phone": phones[0] if phones else None,
        "links": list(dict.fromkeys(links)),
    }
