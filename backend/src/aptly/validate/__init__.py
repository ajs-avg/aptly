"""The no-fabrication validator.

The product's central promise is that Aptly never adds a skill or a job the
person does not have. A prompt asking nicely is not a guarantee — it is a
tendency. This module is the guarantee: deterministic Python that re-checks
every suggestion after the model has produced it, and drops the ones that cannot
be justified.

Seven layers, cheapest first:

1. **Anchor** — ``before`` must still match the node. Otherwise the person
   edited the line since we asked, and applying would silently destroy that.
2. **Provenance** — the cited source must exist, and its quote must genuinely
   appear in it. A suggestion that cannot show its working is discarded.
3. **Claims** — every figure, name and technical token in ``after`` must already
   exist in the person's own material. Figures are absolute; a number that was
   not there is never acceptable.
4. **Self-description** — a summary may not change what the person says they
   *are*. Layer 3 checks the nouns; this checks the sentence's subject, which
   can be replaced wholesale without introducing a single new named thing.
5. **Deletions** — a skills line may be reordered but not pruned. Fabrication
   has a mirror image: quietly removing true things to make a CV look focused.
6. **Stuffing** — no term may be repeated to game a keyword score.
7. **Proportion** — a rewrite that balloons in length is padding, not tailoring.

Layers 1–5 reject. Layers 6–7 mostly flag, because they measure taste rather
than truth, and a suggestion the user can see and judge is better than one
silently withheld.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from aptly.llm.schemas import JobPost, Suggestion
from aptly.model.document import CVDocument, TextNode, normalize_text
from aptly.validate.entities import (
    FILLER,
    content_words,
    figures,
    proper_nouns,
    technical_tokens,
    vocabulary,
)

RejectionKind = Literal[
    "stale_anchor",
    "unknown_node",
    "not_editable",
    "missing_provenance",
    "unquotable_provenance",
    "invented_figure",
    "invented_name",
    "invented_technology",
    "keyword_stuffing",
    "dropped_skill",
    "dropped_title",
    "changed_self_description",
    "no_change",
]

FlagKind = Literal[
    "confirm_wording",
    "borrowed_term",
    "much_longer",
    "low_confidence",
    "dropped_detail",
    "less_specific",
]

#: How much longer a rewrite may get before it looks like padding.
MAX_LENGTH_RATIO = 1.6

#: How many times one job term may appear in a single rewritten line.
MAX_TERM_REPEATS = 2


@dataclass(frozen=True, slots=True)
class Flag:
    """Something the user should see, but not a reason to withhold the change."""

    kind: FlagKind
    detail: str


@dataclass(frozen=True, slots=True)
class Verdict:
    """What the validator decided about one suggestion."""

    ok: bool
    rejection: RejectionKind | None = None
    detail: str = ""
    flags: tuple[Flag, ...] = field(default_factory=tuple)

    @property
    def needs_confirmation(self) -> bool:
        return any(flag.kind in {"confirm_wording", "borrowed_term"} for flag in self.flags)


@dataclass(slots=True)
class SourceMaterial:
    """Everything the person has actually written, pooled for checking.

    Built once per tailoring run from three things, all of them the person's own
    words: their uploaded CV, their Story Bank, and their career profile.

    Note what is *absent*: the job post. Terms from the advert are not evidence
    about the applicant, and treating them as source material would let the model
    launder the employer's wish list into the person's history — precisely the
    failure this product exists to avoid.

    The profile is what lets a rebuilt CV be fuller than the one uploaded. An
    uploaded CV is a one-page summary written for some other job, so a rebuild
    working only from it can reorder and retighten and little else. Widening the
    evidence base does not loosen the rule — every claim is still checked against
    something the person typed — it just means there is more that they typed.
    """

    text: str
    figures: frozenset[str]
    #: Every word the person wrote, position-independent. Candidate claims are
    #: checked against this rather than against a second strict extraction —
    #: see :func:`aptly.validate.entities.vocabulary` for why that distinction
    #: is load-bearing.
    vocabulary: frozenset[str]
    story_by_id: dict[str, str] = field(default_factory=dict)

    @classmethod
    def build(
        cls,
        document: CVDocument,
        stories: dict[str, str] | None = None,
        profile_text: str = "",
    ) -> SourceMaterial:
        stories = stories or {}
        pooled = "\n".join(
            part
            for part in [document.plain_text(), *stories.values(), profile_text]
            if part.strip()
        )
        return cls(
            text=pooled,
            figures=frozenset(figures(pooled)),
            vocabulary=frozenset(vocabulary(pooled)),
            story_by_id=dict(stories),
        )

    def knows(self, token: str) -> bool:
        return token in self.vocabulary


def validate(
    suggestion: Suggestion,
    *,
    document: CVDocument,
    source: SourceMaterial,
    job: JobPost | None = None,
) -> Verdict:
    """Run every layer. The first rejection wins."""
    node = document.node(suggestion.node_id)
    if node is None:
        return Verdict(False, "unknown_node", f"No CV line has id {suggestion.node_id!r}.")
    if not node.editable:
        return Verdict(
            False,
            "not_editable",
            f"{node.role} is a fact about the person, not text to be rewritten.",
        )
    if not node.matches(suggestion.before) and not _repair_anchor(suggestion, node):
        return Verdict(False, "stale_anchor", "This line changed after the suggestion was written.")
    if normalize_text(suggestion.after) == node.normalized:
        return Verdict(False, "no_change", "The rewrite is identical to the current text.")

    if (verdict := _check_provenance(suggestion, document, source)) is not None:
        return verdict
    if (verdict := _check_claims(suggestion, source)) is not None:
        return verdict
    if (verdict := _check_self_description(suggestion, node, source)) is not None:
        return verdict
    if (verdict := _check_title_loss(suggestion, node)) is not None:
        return verdict
    if (verdict := _check_deletions(suggestion, node)) is not None:
        return verdict
    if (verdict := _check_stuffing(suggestion, job)) is not None:
        return verdict

    return Verdict(True, flags=_collect_flags(suggestion, node.text, source, job))


# ── layer 1b: anchor repair ─────────────────────────────────────────────────

#: How much of a node the model must have quoted for us to believe it meant
#: that node rather than a different one.
_MIN_QUOTE_COVERAGE = 0.5


def _repair_anchor(suggestion: Suggestion, node: TextNode) -> bool:
    """Accept a near-miss quote of a long line, and correct it in place.

    ``before`` has one job on the server: proving the model was looking at the
    line it claims. Identification is already handled by ``node_id``, and the
    check that actually protects the user's work runs in the browser at the
    moment they tap Apply, against the live text.

    Asked to reproduce a four-line bullet character for character, models
    routinely quote only its opening. Rejecting those outright discarded good
    suggestions on exactly the longest, most-worth-improving lines. So a quote
    that is a genuine prefix or substring of the node — and covers enough of it
    to be unambiguous — is repaired to the node's real text rather than thrown
    away.
    """
    quoted = normalize_text(suggestion.before)
    actual = normalize_text(node.text)
    if not quoted or len(quoted) < len(actual) * _MIN_QUOTE_COVERAGE:
        return False
    if quoted not in actual:
        return False

    suggestion.before = node.text
    return True


# ── layer 3b: self-description ──────────────────────────────────────────────

#: Words that open a summary without being part of the claim, so the noun phrase
#: after them is what actually gets compared.
_SUMMARY_LEAD = re.compile(
    r"^(?:an?|the|experienced|seasoned|highly|motivated|results[- ]driven)\s+", re.IGNORECASE
)

#: How much of the original self-description has to survive. Below this the
#: rewrite is describing somebody else.
_IDENTITY_OVERLAP = 0.5


def _check_self_description(
    suggestion: Suggestion, node: TextNode, source: SourceMaterial
) -> Verdict | None:
    """A summary may not change what the person says they are.

    This layer exists because of a specific, observed, and severe failure. Given
    a frontend developer's CV and a data-engineering post, the tailoring pass
    rewrote

        "Frontend developer with three years building customer-facing web
         applications."

    as

        "Data professional with three years building production data
         pipelines."

    Every earlier layer passed it. There was no new figure, no new technology, no
    lost employer, no keyword stuffing — the sentence simply asserted that the
    person was somebody else. It is the single most damaging thing this product
    could do, because it is the claim a phone screen tests first.

    The rule is narrow on purpose. It applies only to the summary, which is the
    one line whose subject *is* an identity claim; a bullet may open with any
    verb it likes. Rewording the same identity is fine — "Frontend developer" to
    "Front-end engineer" survives, because the words overlap. Adopting the
    employer's description of the role does not, unless the CV somewhere says
    that is what the person is.
    """
    if node.role != "summary":
        return None

    before = _identity(suggestion.before)
    after = _identity(suggestion.after)
    if not before or not after or before == after:
        return None

    overlap = len(set(before) & set(after)) / len(set(before))
    if overlap >= _IDENTITY_OVERLAP:
        return None

    # A genuinely different self-description is still allowed when the CV says
    # so — somebody whose experience section reads "Data Engineer" may lead with
    # that even if their summary currently does not.
    #
    # The test is on the *phrase*, not on its words. Checking words individually
    # let "Data professional" through on a CV that happened to contain "Backend
    # & Data" and a heading reading "PROFESSIONAL SUMMARY": every word was
    # known, and the claim was still invented.
    if _names(source.text, after):
        return None

    return Verdict(
        False,
        "changed_self_description",
        f"Rewrites what this person is — “{' '.join(before)}” became "
        f"“{' '.join(after)}” — which the CV does not support.",
    )


def _identity(text: str) -> list[str]:
    """The content words of the opening noun phrase: what the sentence claims to be.

    Stops at the first preposition or participle, which is where the description
    of the person ends and the description of their work begins. "Frontend
    developer with three years building…" yields ["frontend", "developer"].
    """
    cleaned = _SUMMARY_LEAD.sub("", normalize_text(text)).lower()
    words: list[str] = []
    for word in re.findall(r"[a-z][a-z+#.-]*", cleaned):
        if word in _IDENTITY_ENDS:
            break
        if len(word) > 2 and word not in FILLER:
            words.append(word)
        if len(words) >= 4:
            break
    return words


#: Where a self-description stops and a description of the work begins.
_IDENTITY_ENDS = frozenset(
    {
        "with",
        "who",
        "that",
        "which",
        "having",
        "specialising",
        "specializing",
        "focused",
        "focussed",
        "building",
        "working",
        "delivering",
        "experienced",
    }
)


def _names(haystack: str, words: list[str]) -> bool:
    """Does the source contain this identity as a contiguous phrase?"""
    phrase = " ".join(words)
    return bool(phrase) and phrase in normalize_text(haystack).lower()


# ── layer 2: provenance ─────────────────────────────────────────────────────


def _check_provenance(
    suggestion: Suggestion, document: CVDocument, source: SourceMaterial
) -> Verdict | None:
    provenance = suggestion.provenance
    if not provenance.source_id or not provenance.quote.strip():
        return Verdict(False, "missing_provenance", "The suggestion cites no source.")

    if provenance.kind == "story_item":
        body = source.story_by_id.get(provenance.source_id)
    else:
        cited = document.node(provenance.source_id)
        body = cited.text if cited else None

    if body is None:
        return Verdict(
            False,
            "unquotable_provenance",
            f"Cited source {provenance.source_id!r} does not exist.",
        )

    if normalize_text(provenance.quote) not in normalize_text(body):
        return Verdict(
            False,
            "unquotable_provenance",
            "The quoted evidence does not appear in the source it cites.",
        )
    return None


# ── layer 3: claims ─────────────────────────────────────────────────────────


def unsupported_claims(text: str, source: SourceMaterial) -> tuple[RejectionKind, str] | None:
    """Every figure, name and technology in ``text`` that the person never wrote.

    Public and suggestion-free so the freely-rebuilt CV can run the identical
    check on every line it composes. A rebuild generates whole sentences rather
    than editing existing ones, which means it has *more* room to invent, not
    less — so it needs the same test, not a gentler one.
    """
    if invented := figures(text) - source.figures:
        return "invented_figure", f"Introduces a figure that is not in your CV: {_show(invented)}."
    if invented := {n for n in proper_nouns(text) if not source.knows(n)}:
        return "invented_name", f"Introduces a name that is not in your CV: {_show(invented)}."
    if invented := {t for t in technical_tokens(text) if not source.knows(t)}:
        return (
            "invented_technology",
            f"Introduces a technology that is not in your CV: {_show(invented)}.",
        )
    return None


def _check_claims(suggestion: Suggestion, source: SourceMaterial) -> Verdict | None:
    found = unsupported_claims(suggestion.after, source)
    return None if found is None else Verdict(False, found[0], found[1])


# ── layer 4: deletions ──────────────────────────────────────────────────────


#: "Data Science Intern - CSC India: …", "AI Academic Assistant (RAG System) — …"
#: A title, then a separator, then the description. Extremely common on graduate
#: CVs, where each role or project is one bullet rather than its own entry.
#:
#: A colon wins over a dash, and may span dashes, so that "Data Science Intern -
#: CSC India:" is protected whole. Stopping at the first dash would guard the job
#: title while leaving the employer's name free to be deleted — the wrong half.
_TITLE_BY_COLON = re.compile(r"^(?P<title>[^:]{4,70}):\s+(?P<body>\S.*)$", re.DOTALL)
_TITLE_BY_DASH = re.compile(r"^(?P<title>[^:–—-]{4,70}?)\s*[-–—]\s+(?P<body>\S.*)$", re.DOTALL)


def _lead_in(text: str) -> str | None:
    """The title at the front of a bullet, if it has one."""
    for pattern in (_TITLE_BY_COLON, _TITLE_BY_DASH):
        if match := pattern.match(text):
            title = match.group("title").strip()
            # A "title" that is really a sentence is prose, not a label.
            if 0 < len(title.split()) <= 10:
                return title
    return None


def _check_title_loss(suggestion: Suggestion, node: TextNode) -> Verdict | None:
    """Keep the employer or project name at the front of a bullet.

    Asked to make a bullet punchier, a model reliably deletes the lead-in —
    "Data Science Intern - CSC India: Conducted data cleaning…" becomes
    "Conducted data cleaning…". The prose does read better. It has also removed
    where the person worked, which is the single most important fact on the
    line and the reason it is on the CV at all.
    """
    if node.role != "bullet":
        return None
    title = _lead_in(node.text.strip())
    if title is None:
        return None
    if normalize_text(suggestion.after).startswith(normalize_text(title)):
        return None

    return Verdict(
        False,
        "dropped_title",
        f"Drops {title!r} from the front of the line. "
        "That names where the work happened — rewrite what follows it instead.",
    )


def _check_deletions(suggestion: Suggestion, node: TextNode) -> Verdict | None:
    """Guard against tailoring by subtraction.

    Asked to align a CV with a post, a model will happily "focus" a skills line
    by deleting everything the post did not mention — turning
    "Python, C, C++, Java, SQL" into "Python, SQL". That is not tailoring. The
    person really does know C++, another reader really is scanning for it, and
    the edit quietly makes their CV worse for every other application.

    Enforced only on skills lines, where an omission is unambiguous. A bullet
    may legitimately drop a detail while being tightened, so there it is a flag
    rather than a rejection.
    """
    if node.role != "skill_line":
        return None

    kept = {t.lower() for t in _skill_terms(suggestion.after)}
    dropped = [t for t in _skill_terms(suggestion.before) if t.lower() not in kept]
    if not dropped:
        return None

    return Verdict(
        False,
        "dropped_skill",
        "Removes skills you have: " + ", ".join(sorted(dropped)[:4]) + ". "
        "Reordering to lead with what this job wants is fine; deleting is not.",
    )


def _skill_terms(text: str) -> list[str]:
    """The individual skills on a line, ignoring any leading category label."""
    body = text.split(":", 1)[1] if ":" in text[:40] else text
    return [part.strip(" .;") for part in re.split(r"[,;·|]", body) if part.strip(" .;")]


# ── layer 5: stuffing ───────────────────────────────────────────────────────


def _check_stuffing(suggestion: Suggestion, job: JobPost | None) -> Verdict | None:
    if job is None:
        return None
    lowered = suggestion.after.lower()
    for keyword in job.keywords:
        term = keyword.lower().strip()
        if len(term) < 3:
            continue
        if len(re.findall(rf"\b{re.escape(term)}\b", lowered)) > MAX_TERM_REPEATS:
            return Verdict(
                False,
                "keyword_stuffing",
                f"Repeats {keyword!r} more than {MAX_TERM_REPEATS} times in one line.",
            )
    return None


# ── layer 6: flags ──────────────────────────────────────────────────────────


def _collect_flags(
    suggestion: Suggestion, before: str, source: SourceMaterial, job: JobPost | None
) -> tuple[Flag, ...]:
    flags: list[Flag] = []

    if before and len(suggestion.after) > len(before) * MAX_LENGTH_RATIO:
        flags.append(
            Flag("much_longer", "This rewrite is noticeably longer than the original line.")
        )

    # A term lifted from the advert that the CV has never used. Allowed — often
    # it is the employer's word for something the person genuinely did — but the
    # person should agree it describes their work before sending it.
    if job:
        borrowed = [
            keyword
            for keyword in job.keywords
            if keyword.lower() in suggestion.after.lower()
            and keyword.lower() not in source.text.lower()
        ]
        if borrowed:
            flags.append(
                Flag(
                    "borrowed_term",
                    "Uses the employer's wording for your work: "
                    + ", ".join(sorted(set(borrowed))[:3])
                    + ". Check it describes what you did.",
                )
            )

    # Fabrication has a mirror image. A rewrite that tightens a bullet can also
    # quietly drop the employer's name or the number that made it land, and no
    # amount of checking what was *added* will notice. Tightening is legitimate,
    # so this is surfaced rather than blocked — but the person gets to see it.
    if dropped := _dropped_details(before, suggestion.after):
        flags.append(
            Flag(
                "dropped_detail",
                "This removes " + ", ".join(sorted(dropped)[:3]) + " from the line.",
            )
        )

    if vaguer := _lost_specificity(before, suggestion.after):
        flags.append(
            Flag(
                "less_specific",
                "This reads vaguer than the original — it drops "
                + ", ".join(sorted(vaguer)[:3])
                + " without putting anything in their place.",
            )
        )

    if suggestion.requires_confirmation:
        flags.append(Flag("confirm_wording", "Check this reads true before you send it."))
    if suggestion.confidence == "low":
        flags.append(Flag("low_confidence", "A judgement call — read it closely."))

    return tuple(flags)


#: How many meaningful words a rewrite may shed before it reads as vaguer
#: rather than tighter.
_MAX_SILENT_LOSSES = 2


def _lost_specificity(before: str, after: str) -> set[str]:
    """Words that make the person specific, removed and replaced with nothing.

    A rewrite that trades "Responsible for building X" for "Built X" drops only
    filler and is exactly what we want. One that trades "Frontend developer
    building customer-facing web applications" for "Developer building
    applications" drops the words that said who they are, and adds none — that
    is subtraction wearing the costume of concision.
    """
    was, now = content_words(before), content_words(after)
    lost, gained = was - now, now - was
    if gained or len(lost) < _MAX_SILENT_LOSSES:
        return set()
    return lost


def _dropped_details(before: str, after: str) -> set[str]:
    """Names and figures that were in the original line and are not in the rewrite.

    Membership is tested against the rewrite's whole *vocabulary*, not against a
    second strict extraction of it. Reordering a line moves words across
    sentence-start boundaries — "…, REST API" becoming "REST API, …" — and a
    position-sensitive comparison reports the word as deleted when it is simply
    now at the front.
    """
    kept = vocabulary(after)
    lost_names = {n for n in proper_nouns(before) if n not in kept}
    lost_figures = figures(before) - figures(after)
    return lost_names | lost_figures


def _show(tokens: set[str], limit: int = 3) -> str:
    ordered = sorted(tokens)[:limit]
    return ", ".join(repr(token) for token in ordered)


__all__ = ["Flag", "SourceMaterial", "Verdict", "validate"]
