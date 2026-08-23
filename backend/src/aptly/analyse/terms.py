"""Does this CV actually name this thing?

A job post asks for two different kinds of thing, and they need deciding two
different ways.

**Named things** — Kafka, Airflow, dbt, Snowflake, a CFA, a driving licence.
These are facts about a person's history. Either the CV says it or it does not,
and nothing about a sentence's meaning changes that. A CV listing React,
Next.js, Redux and Tailwind does not "partly" have Kafka, however close the two
lines sit in an embedding space — and the first version of the gap map, which
let similarity decide, reported exactly that.

**Capabilities** — "can troubleshoot production issues independently",
"comfortable with ambiguity", "has worked with non-technical stakeholders".
These genuinely are fuzzy, they are stated a hundred different ways, and
similarity is the right tool.

This module handles the first kind, literally. It is unglamorous string matching
and that is the point: it is the part of the coverage meter that cannot talk
itself into a false positive.

The alias table exists because a person writing "K8s" has used Kubernetes, and
failing them for their abbreviation would be the mirror-image failure — under-
reporting coverage on evidence that is plainly there. Aliases are equivalences
between *names for the same thing*, never between related things: "Postgres" is
"PostgreSQL", but "MySQL" is not, and neither is "a relational database".
"""

from __future__ import annotations

import re
from functools import lru_cache

from aptly.model.document import normalize_text

#: Groups of names for one thing. Order within a group does not matter; every
#: member is treated as every other. Kept short deliberately — each entry is a
#: claim that two strings mean the same thing, and a wrong one silently marks a
#: person as having a skill they do not.
_ALIAS_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"kubernetes", "k8s"}),
    frozenset({"javascript", "js", "ecmascript"}),
    frozenset({"typescript", "ts"}),
    frozenset({"postgresql", "postgres", "psql"}),
    frozenset({"amazon web services", "aws"}),
    frozenset({"google cloud platform", "google cloud", "gcp"}),
    frozenset({"microsoft azure", "azure"}),
    frozenset({"structured query language", "sql"}),
    frozenset({"machine learning", "ml"}),
    frozenset({"natural language processing", "nlp"}),
    frozenset({"large language model", "large language models", "llm", "llms"}),
    frozenset({"continuous integration", "ci"}),
    frozenset({"ci/cd", "cicd", "ci cd"}),
    frozenset({"infrastructure as code", "iac"}),
    frozenset({"react", "react.js", "reactjs"}),
    frozenset({"node", "node.js", "nodejs"}),
    frozenset({"next.js", "nextjs"}),
    frozenset({"express", "express.js", "expressjs"}),
    frozenset({"rest", "restful", "rest api", "rest apis"}),
    frozenset({"user interface", "ui"}),
    frozenset({"user experience", "ux"}),
    frozenset({"business intelligence", "bi"}),
    frozenset({"extract transform load", "etl"}),
    frozenset({"object relational mapper", "orm"}),
    frozenset({"github actions", "gh actions"}),
    frozenset({"golang", "go lang"}),
    frozenset({"c sharp", "c#"}),
    frozenset({"c plus plus", "c++"}),
    frozenset({"dot net", ".net", "dotnet"}),
)

#: Terms too short or too common to match on. "Go" and "R" are real languages
#: and real English words, and a false positive on either is worse than the miss:
#: it tells somebody they have a language they do not.
_UNMATCHABLE = frozenset({"go", "r", "c", "d", "it", "ai", "ar", "vr"})

#: Words that make a "keyword" a description rather than a name. A requirement
#: keyworded "strong communication" is not a thing to look up.
_NOT_A_NAME = re.compile(
    r"\b(?:strong|excellent|good|solid|deep|proven|hands[- ]on|experience|"
    r"ability|skills?|knowledge|understanding|familiarity|passion|years?)\b",
    re.IGNORECASE,
)

#: Products whose own branding is lowercase, so the capitalisation test below
#: would wrongly read them as ordinary words.
_LOWERCASE_BRANDS = frozenset(
    {
        "dbt",
        "npm",
        "pnpm",
        "yarn",
        "webpack",
        "vite",
        "esbuild",
        "nginx",
        "kubectl",
        "iOS",
        "macOS",
        "pandas",
        "numpy",
        "scikit-learn",
        "sklearn",
        "pytest",
        "matplotlib",
        "eslint",
        "prettier",
        "grep",
        "curl",
    }
)

#: Characters that only appear in product names, never in an English phrase.
_NAME_MARKER = re.compile(r"[0-9+#./]")


def is_hard_name(term: str) -> bool:
    """Is this the name of a specific product, or a description of a capability?

    The distinction decides whether a requirement is settled literally or
    semantically, and getting it wrong is expensive in both directions: treat
    "Kafka" as a capability and similarity will find it in a list of frontend
    frameworks; treat "data engineering" as a name and a data engineer's CV
    fails to match a data-engineering role because it says "engineer" and the
    post said "engineering".

    Capitalisation turns out to separate the two almost perfectly, because this
    is what capitalisation is *for*. "Airflow", "BigQuery", "GitHub Actions" and
    "AWS Lambda" are proper nouns and are written as such; "window functions",
    "dimensional modelling" and "data engineering" are not. The exceptions are
    products that brand themselves lowercase, which are listed above, and names
    carrying a digit or punctuation — S3, C++, Python 3, .NET — which no English
    phrase does.

    Note this reads ``term`` with its **original casing**, so it must be called
    before any normalisation.
    """
    term = term.strip()
    if not term or not is_nameable(term):
        return False
    if term in _LOWERCASE_BRANDS or term.lower() in _LOWERCASE_BRANDS:
        return True
    if _NAME_MARKER.search(term):
        return True

    words = [word for word in re.split(r"[\s/-]+", term) if word]
    alphabetic = [word for word in words if word[0].isalpha()]
    if not alphabetic:
        return False
    # Every word capitalised, or the whole thing an acronym.
    return all(word[0].isupper() or word.lower() in _LOWERCASE_BRANDS for word in alphabetic)


@lru_cache(maxsize=512)
def aliases_of(term: str) -> frozenset[str]:
    """Every name for the same thing, including the term itself."""
    key = canonical(term)
    for group in _ALIAS_GROUPS:
        if key in group:
            return group
    return frozenset({key})


def is_nameable(term: str) -> bool:
    """Is this a specific thing to look for, rather than a description of one?

    "Kafka" is nameable. "Strong SQL skills" is not — it contains a name, but as
    a whole it is a judgement, and looking it up literally would always miss.
    """
    folded = canonical(term)
    if len(folded) < 2 or folded in _UNMATCHABLE:
        return False
    if _NOT_A_NAME.search(folded):
        return False
    # Four words or more is a sentence about a capability, not a product name.
    return len(folded.split()) <= 3


def mentions(haystack: str, term: str) -> bool:
    """Does ``haystack`` name ``term``, under any of its aliases?

    Whole-token matching, so "Java" does not match inside "JavaScript" and "SQL"
    does not match inside "NoSQL" — both of which are different skills, and both
    of which a naive substring search reports as present.
    """
    if not is_nameable(term):
        return False
    return names_any(canonical(haystack), aliases_of(term))


def found_in(haystack: str, terms: list[str]) -> tuple[list[str], list[str]]:
    """Split ``terms`` into those the text names and those it does not.

    Terms that are not nameable at all are excluded from both lists: they are
    not evidence either way, and counting them as missing would penalise a CV
    for failing to contain the phrase "strong communication skills".
    """
    present: list[str] = []
    absent: list[str] = []
    for term in terms:
        if not is_nameable(term):
            continue
        (present if mentions(haystack, term) else absent).append(term)
    return present, absent


# ═══════════════════════════════════════════════════════════════════════════
# Internals
# ═══════════════════════════════════════════════════════════════════════════


def canonical(text: str) -> str:
    """Lowercased, whitespace-collapsed, and stripped of decorative punctuation.

    ``+``, ``#`` and ``.`` survive, because dropping them turns C++ into C, C#
    into C, and .NET into net.

    Public because the live scorecard ships pre-canonicalised aliases to the
    browser, and the browser has to fold the CV text the same way. This function
    and :func:`names_any` are the entire contract between the two — see
    ``analyse/scoring.py`` and ``frontend/src/lib/score.ts``.
    """
    text = normalize_text(text).lower()
    text = re.sub(r"[^\w+#./\s-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@lru_cache(maxsize=1024)
def _pattern(term: str) -> re.Pattern[str]:
    """A whole-token matcher for one already-canonical term.

    Alphanumeric characters are the token boundary, so ``c++`` is found in
    "C++ and Java" but ``java`` is not found in "JavaScript". Internal spaces
    are allowed to be any run of whitespace, since a CV may wrap a phrase.
    """
    parts = [re.escape(word) for word in term.split()]
    body = r"\s+".join(parts)
    return re.compile(rf"(?<![A-Za-z0-9]){body}(?![A-Za-z0-9])")


def names_any(haystack: str, aliases: list[str] | frozenset[str]) -> bool:
    """Does already-canonical ``haystack`` name any of these canonical aliases?

    The second half of the contract with the browser. Whole-token, where a token
    boundary is "not a letter or a digit" — so ``c++`` is found in "C++ and
    Java", ``java`` is not found in "JavaScript", and ``sql`` is not found in
    "NoSQL". Those three cases are the difference between a score somebody can
    trust and one they cannot.
    """
    return any(_pattern(alias).search(haystack) is not None for alias in aliases if alias)


__all__ = [
    "aliases_of",
    "canonical",
    "found_in",
    "is_hard_name",
    "is_nameable",
    "mentions",
    "names_any",
]
