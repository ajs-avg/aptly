"""Who is calling?

The phone rings: "Hi, it's Priya from Meridian, about the data analyst
role." Somebody with fifteen data-analyst applications open cannot find the
right one by scrolling, and a search box that wants the exact company name
is no use when all they caught was half of it.

This takes what the person heard, as they would say it — in English, in
Hinglish, half-remembered — and finds the application it means. Two layers,
in order:

1. **Deterministic.** Every word of the query is tried against every
   record's company, role, location, notes, the frozen advert and its
   keywords, with fuzzy matching for the company. Fast, free, explainable:
   every point scored comes with the reason it was scored.
2. **The model, only when it is needed.** When two records are close — two
   Meridians, two data roles — a small model call reads the query and the
   shortlist and picks, with its reason. It may only choose from the
   shortlist; it can never introduce a record the first layer did not find.

Nothing here hides its working. The result carries why it matched, how sure
it is, and the runners-up, so a wrong guess is a glance away from being
corrected rather than silently trusted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any, Literal

from pydantic import BaseModel, Field

from aptly.db.schemas import RecordSummary
from aptly.llm.client import GeminiClient
from aptly.logging import get_logger

log = get_logger(__name__)

Confidence = Literal["sure", "likely", "unsure", "none"]


# ═══════════════════════════════════════════════════════════════════════════
# What goes out
# ═══════════════════════════════════════════════════════════════════════════


class FindRequest(BaseModel):
    query: str = Field(min_length=1, max_length=600)


class Candidate(BaseModel):
    record: RecordSummary
    score: int = Field(ge=0, le=100)
    #: Why it scored, as short phrases: "company: Meridian", "Priya in notes".
    why: list[str]


class FindResult(BaseModel):
    query: str
    best: Candidate | None
    confidence: Confidence
    #: The runners-up, strongest first. "Or this one?"
    others: list[Candidate]
    #: One line the screen can say: what was found, or what was not.
    note: str
    #: Whether the model was asked to choose between close candidates.
    used_model: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# What goes in
# ═══════════════════════════════════════════════════════════════════════════


@dataclass(slots=True)
class Entry:
    """One saved application, as the finder reads it."""

    summary: RecordSummary
    notes: str = ""
    advert: str = ""
    #: Everything the parse pulled out of the advert, flattened to terms.
    terms: list[str] = field(default_factory=list)


def entry_from_row(summary: RecordSummary, *, notes: str | None, snapshot: dict[str, Any] | None) -> Entry:
    snapshot = snapshot or {}
    parsed = snapshot.get("parsed") or {}
    terms: list[str] = list(parsed.get("keywords") or [])
    for requirement in parsed.get("requirements") or []:
        terms.extend(requirement.get("keywords") or [])
    for key in ("company", "role", "location", "seniority", "employment_type"):
        if parsed.get(key):
            terms.append(str(parsed[key]))
    return Entry(
        summary=summary,
        notes=notes or "",
        advert=str(snapshot.get("raw") or "")[:12_000],
        terms=terms,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Words
# ═══════════════════════════════════════════════════════════════════════════

#: What a person says around the words that matter, in English and in
#: Hinglish. "Priya bol rahi hai Meridian se, data analyst wali post ke liye"
#: carries four useful words and nine of these.
_FILLER = frozenset(
    """
    a an the and or but is are was were be been it its this that these those
    there here he she they them his her their someone somebody person people
    guy lady man woman aadmi aurat koi banda bandi
    i me my mine we us our you your
    from about regarding re for of to at in on with by as via
    call calling called calls phone phoned rang ring ringing message messaged
    mail mailed email emailed
    said says saying say tell told asking asked ask want wants wanted
    hi hello hey ok okay so um uh like just
    company firm employer org organisation organization
    role post position job opening vacancy profile jd requirement
    hai hain tha thi the hoon ho hun
    se ka ki ke ko ne mein me par pe
    bol bola boli bolte bolti rahi raha rahe rha rhi
    wali wala wale vali vala vale
    liye liya liyah kiye kiya
    yeh ye yah woh wo vo is us
    aur ya or phir fir toh to
    kaun kon kya kyun kaise kab kahan
    unka unki unke uska uski uske mera meri mere
    karo karna kar kiya kiye karte
    bhai yaar sir madam ji
    """.split()
)

#: Suffixes a caller drops from a company name, and so should the matcher.
_COMPANY_NOISE = frozenset(
    """
    ltd limited pvt private inc llc llp plc co corp corporation company
    technologies technology tech labs lab solutions systems software services
    group holdings india global international consulting consultancy
    """.split()
)

#: Role words too common to tell two applications apart on their own.
_ROLE_GENERIC = frozenset(
    "senior junior lead principal staff associate manager engineer developer analyst "
    "specialist consultant intern head director executive officer".split()
)


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()).strip()


def _tokens(text: str) -> list[str]:
    return [t for t in _norm(text).split() if t]


def _words(text: str) -> list[str]:
    """Query words worth matching: no filler, nothing shorter than three letters."""
    return [t for t in _tokens(text) if t not in _FILLER and (len(t) >= 3 or t.isdigit())]


def _company_core(name: str | None) -> list[str]:
    return [t for t in _tokens(name or "") if t not in _COMPANY_NOISE and len(t) >= 2]


def _similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _phrases(words: list[str], up_to: int = 3) -> list[str]:
    """Every run of one to three consecutive query words."""
    out: list[str] = []
    for n in range(1, up_to + 1):
        for i in range(len(words) - n + 1):
            out.append(" ".join(words[i : i + n]))
    return out


# ═══════════════════════════════════════════════════════════════════════════
# Scoring
# ═══════════════════════════════════════════════════════════════════════════

_LIVE = frozenset({"screening", "interviewing", "offer"})


@dataclass(slots=True)
class _Scored:
    entry: Entry
    score: float
    why: list[str]


def _score(words: list[str], query: str, entry: Entry, now: datetime) -> _Scored:
    s = entry.summary
    score = 0.0
    why: list[str] = []
    claimed: set[str] = set()

    # ── Company: the thing a caller most often says, and says loosely. ────
    core = _company_core(s.company)
    if core:
        joined = " ".join(core)
        best = 0.0
        hit = ""
        for phrase in _phrases(words):
            if phrase == joined:
                best, hit = 1.0, phrase
                break
            if phrase in core and len(phrase) >= 4:
                best, hit = max(best, 0.92), phrase
                continue
            ratio = _similar(phrase, joined)
            if ratio > best:
                best, hit = ratio, phrase
        # A single token against one of the company's words, for "meridain".
        for token in words:
            for part in core:
                if len(token) >= 4 and len(part) >= 4:
                    ratio = _similar(token, part)
                    if ratio > best:
                        best, hit = ratio, token
        if best >= 0.99:
            score += 60
            why.append(f"company: {s.company}")
            claimed.update(hit.split())
        elif best >= 0.9:
            score += 45
            why.append(f"company: {s.company}")
            claimed.update(hit.split())
        elif best >= 0.8:
            score += 30
            why.append(f"company sounds like “{hit}”")
            claimed.update(hit.split())
        elif best >= 0.72:
            score += 16
            why.append(f"company may be “{hit}”")
            claimed.update(hit.split())

    # ── Role: by its specific words, with a stem so "analytics" meets "analyst".
    role_words = [t for t in _tokens(s.role or "") if t not in _FILLER]
    matched_role: list[str] = []
    for part in role_words:
        for token in words:
            if token in claimed:
                continue
            if token == part or (len(token) >= 5 and len(part) >= 5 and token[:5] == part[:5]):
                matched_role.append(part)
                claimed.add(token)
                break
    if matched_role:
        specific = [p for p in matched_role if p not in _ROLE_GENERIC]
        score += min(30, 12 * len(specific) + 6 * (len(matched_role) - len(specific)))
        # The whole title, said back: "data analyst" is not just "data".
        if role_words and len(matched_role) == len(role_words):
            score += 8
        why.append(f"role: {s.role}")

    # ── Where. ─────────────────────────────────────────────────────────────
    for part in _tokens(s.location or ""):
        if len(part) >= 4 and part in words and part not in claimed:
            score += 8
            why.append(f"location: {s.location}")
            claimed.add(part)
            break

    # ── A name, or anything else, in the notes: the recruiter from last time.
    note_tokens = set(_tokens(entry.notes))
    note_hits = [t for t in words if t not in claimed and t in note_tokens]
    if note_hits:
        score += min(30, 20 + 8 * (len(note_hits) - 1))
        why.append(f"“{note_hits[0]}” in your notes")
        claimed.update(note_hits)

    # ── The advert itself: an agency's name, a team, a phrase they repeat. ──
    advert_tokens = set(_tokens(entry.advert))
    term_tokens = set(t for term in entry.terms for t in _tokens(term))
    keyword_hits = [t for t in words if t not in claimed and t in term_tokens]
    advert_hits = [t for t in words if t not in claimed and t not in term_tokens and t in advert_tokens]
    if keyword_hits:
        score += min(14, 5 * len(keyword_hits))
        why.append("asks for " + ", ".join(keyword_hits[:3]))
        claimed.update(keyword_hits)
    if advert_hits:
        score += min(12, 4 * len(advert_hits))
        why.append("“" + advert_hits[0] + "” in the advert")
        claimed.update(advert_hits)

    # ── When, if they said. ────────────────────────────────────────────────
    when = s.applied_at or s.created_at
    if when is not None:
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        days = max(0, (now - when).days)
        window = _window(query)
        if window is not None:
            low, high = window
            if low <= days <= high:
                score += 8
                why.append("applied when you said")
            else:
                score -= 6

    # ── Tie-breakers only: a live application is the likelier caller. ─────
    if s.status in _LIVE:
        score += 3
    elif s.status in {"rejected", "withdrawn"}:
        score -= 4

    return _Scored(entry=entry, score=max(0.0, score), why=why)


def _window(query: str) -> tuple[int, int] | None:
    q = _norm(query)
    if re.search(r"\b(today|aaj|abhi)\b", q):
        return (0, 1)
    if re.search(r"\b(yesterday|kal|parso)\b", q):
        return (0, 4)
    if re.search(r"\b(this|is)\s+(week|hafte|hafta)\b", q):
        return (0, 8)
    if re.search(r"\b(last|pichle|pichhle|previous)\s+(week|hafte|hafta)\b", q):
        return (4, 16)
    if re.search(r"\b(last|pichle|pichhle|previous)\s+(month|mahine|mahina)\b", q):
        return (18, 50)
    if re.search(r"\b(few|kuch|couple of)\s+(weeks|hafte)\b", q):
        return (10, 35)
    if re.search(r"\b(long|bahut|kaafi)\s+(ago|pehle|time)\b", q) or re.search(r"\bmonths?\s+ago\b", q):
        return (40, 400)
    return None


def _confidence(top: float, second: float) -> Confidence:
    if top < 18:
        return "none"
    gap = top - second
    if top >= 55 and gap >= 20:
        return "sure"
    if top >= 34 and gap >= 10:
        return "likely"
    # One real hit and nothing else in the running — a first name in the
    # notes, say — is an answer, not a shrug.
    if top >= 20 and second < 8:
        return "likely"
    return "unsure"


def rank(query: str, entries: list[Entry], *, now: datetime | None = None) -> list[_Scored]:
    now = now or datetime.now(UTC)
    words = _words(query)
    if not words:
        return []
    scored = [_score(words, query, entry, now) for entry in entries]
    scored.sort(key=lambda item: (-item.score, -item.entry.summary.created_at.timestamp()))
    return scored


# ═══════════════════════════════════════════════════════════════════════════
# The model, for the close calls
# ═══════════════════════════════════════════════════════════════════════════


class _Pick(BaseModel):
    best_id: str | None = Field(
        description="The id of the one application the caller means, or null if none of them fits."
    )
    confidence: Literal["sure", "likely", "unsure", "none"]
    why: str = Field(description="One short sentence, in plain words, naming what in the query decided it.")
    runner_up_id: str | None = Field(
        default=None, description="The id of the next most plausible one, or null."
    )


_PICK_SYSTEM = """\
Somebody's phone rang. They typed what they heard — a name, a company, a \
role, a city, when they applied — in English, in Hindi written with Latin \
letters, or a mix. You are given their saved applications that might be the \
one. Choose which one the caller means.

Rules. Choose only from the list, by id. Company names are the strongest \
signal and callers say them loosely ("Meridian" for "Meridian Analytics"), \
sometimes as an agency hiring for the company. A recruiter's name may appear \
in the notes. If two fit equally, say "unsure" and name both. If none fits, \
best_id is null and confidence is "none". Never guess a company that is not \
in the list.\
"""


def _pick_user(query: str, shortlist: list[_Scored]) -> str:
    lines = [f"# What they heard\n\n{query.strip()}\n", "# Their saved applications\n"]
    for item in shortlist:
        s = item.entry.summary
        when = (s.applied_at or s.created_at).date().isoformat()
        lines.append(f"## id: {s.id}")
        lines.append(f"- company: {s.company or '—'}")
        lines.append(f"- role: {s.role or '—'}")
        lines.append(f"- location: {s.location or '—'}")
        lines.append(f"- status: {s.status} · applied/saved {when}")
        if s.keywords:
            lines.append(f"- the post asks for: {', '.join(s.keywords[:8])}")
        if item.entry.notes.strip():
            lines.append(f"- their notes: {item.entry.notes.strip()[:300]}")
        if item.entry.advert.strip():
            lines.append(f"- the advert begins: {item.entry.advert.strip()[:400]}")
        lines.append("")
    lines.append("Which one is calling?")
    return "\n".join(lines)


async def rerank(query: str, shortlist: list[_Scored], *, client: GeminiClient) -> _Pick | None:
    """Ask the model to choose among a shortlist. Returns None when it cannot."""
    if len(shortlist) < 2:
        return None
    completion = await client.structured(
        model=client.fast_model,
        system=_PICK_SYSTEM,
        user=_pick_user(query, shortlist),
        schema=_Pick,
        temperature=0.1,
        max_output_tokens=400,
        purpose="find",
    )
    pick = completion.value
    ids = {str(item.entry.summary.id) for item in shortlist}
    if pick.best_id is not None and pick.best_id not in ids:
        log.warning("find.model_invented_id", best_id=pick.best_id)
        return None
    if pick.runner_up_id is not None and pick.runner_up_id not in ids:
        pick.runner_up_id = None
    return pick


# ═══════════════════════════════════════════════════════════════════════════
# Putting it together
# ═══════════════════════════════════════════════════════════════════════════

_SHORTLIST = 6
_OTHERS = 3


def _candidate(item: _Scored) -> Candidate:
    return Candidate(record=item.entry.summary, score=int(min(100, round(item.score))), why=item.why)


async def find(
    query: str,
    entries: list[Entry],
    *,
    client: GeminiClient | None = None,
    now: datetime | None = None,
) -> FindResult:
    scored = rank(query, entries, now=now)
    plausible = [item for item in scored if item.score >= 18]

    if not plausible:
        # "Closest" means something matched, however faintly — not that a live
        # application picked up a tie-breaker point for being live.
        closest = [_candidate(item) for item in scored[:_OTHERS] if item.score >= 8 and item.why]
        return FindResult(
            query=query,
            best=None,
            confidence="none",
            others=closest,
            note="Nothing in your Library matches that."
            + (" The closest are below." if closest else ""),
        )

    top, second = plausible[0].score, (plausible[1].score if len(plausible) > 1 else 0.0)
    confidence = _confidence(top, second)
    used_model = False
    ordered = plausible

    # Close call: the model chooses, from the shortlist and nowhere else.
    if confidence != "sure" and len(plausible) >= 2 and client is not None:
        try:
            pick = await rerank(query, plausible[:_SHORTLIST], client=client)
        except Exception as exc:  # noqa: BLE001 — the first layer's answer stands.
            log.warning("find.model_failed", error=str(exc)[:200])
            pick = None
        if pick is not None:
            used_model = True
            if pick.best_id is None:
                confidence = "none" if pick.confidence == "none" else "unsure"
            else:
                by_id = {str(item.entry.summary.id): item for item in plausible}
                chosen = by_id[pick.best_id]
                rest = [item for item in plausible if item is not chosen]
                if pick.runner_up_id and pick.runner_up_id in by_id:
                    runner = by_id[pick.runner_up_id]
                    rest = [runner] + [item for item in rest if item is not runner]
                ordered = [chosen] + rest
                chosen.why = [*chosen.why, f"AI: {pick.why.strip()}"] if pick.why.strip() else chosen.why
                confidence = pick.confidence if pick.confidence != "none" else "unsure"

    if confidence == "none":
        return FindResult(
            query=query,
            best=None,
            confidence="none",
            others=[_candidate(item) for item in ordered[:_OTHERS]],
            note="Probably not one of these, but they are the closest.",
            used_model=used_model,
        )

    best = ordered[0]
    others = [_candidate(item) for item in ordered[1 : 1 + _OTHERS]]
    s = best.entry.summary
    label = " · ".join(p for p in (s.company, s.role) if p)
    note = {
        "sure": f"This is {label}.",
        "likely": f"Most likely {label}.",
        "unsure": f"Possibly {label} — check the others.",
    }[confidence]
    return FindResult(
        query=query,
        best=_candidate(best),
        confidence=confidence,
        others=others,
        note=note,
        used_model=used_model,
    )
