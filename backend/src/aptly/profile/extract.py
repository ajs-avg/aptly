"""Reading a CV into a career profile.

The profile is the thing that makes a rebuilt CV better than the document it
came from. It holds what a person has done across their whole career, not what
one CV happened to have room for — and the no-fabrication checker pools it with
the uploaded file, so a fuller profile widens what the model is *allowed* to
say without loosening the rule that it may only say true things.

Nobody fills in forty fields by hand. So the CV they already have is read into
it, and the form becomes something they correct rather than something they
compose.

Two rules, and both exist because this is the one place in the product where a
model writes into long-term storage:

**It may not invent.** Extraction is transcription with structure. Every value
has to be present in the document; a field it cannot find stays empty, and an
empty field is a normal state that the form asks about later rather than an
error.

**It may not overwrite.** What somebody typed about themselves outranks what a
model read off a PDF, always. Merging is additive by default — see
:func:`merge`.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.document import CVDocument
from aptly.profile.schemas import CareerProfile
from pydantic import BaseModel, Field

log = get_logger(__name__)


EXTRACT_SYSTEM = """\
You read a CV and record what it says about the person, as structured data.

# This is transcription, not writing

Every value you record must be present in the document in front of you. You are \
not improving the CV, not inferring what a role probably involved, and not \
filling a gap with what is usually true of somebody with this history.

- A field the CV does not answer stays as an empty string or an empty list. \
Never write "N/A", "Unknown", "Not specified" or a dash — those are read back \
as real answers and reach a finished CV as literal text.
- Never invent a date, a metric, an employer, a team size or a technology. If a \
bullet says "led the migration" and never says to what, the technology list for \
that role does not gain an entry.
- Copy figures exactly as written. "cut ramp time from 12 weeks to 6" is not \
"cut ramp time by 50%", even though it is.

# What goes where

`what_you_did` is a short paragraph in *their* register describing the role \
overall — assembled from what the CV says about it, not composed afresh.

`achievements` are the specific things done, one per bullet on the CV. Put any \
number that belongs to an achievement in its `metric` field as well as leaving \
it in the text, because the metric field is what later scoring reads.

`skills` come from anywhere in the document — a skills section, a tool named in \
a bullet, a language a project was written in. Set `proficiency` only where the \
CV states it; otherwise leave the default. Do not rate somebody's Python from \
the fact that they used it.

`headline` is what they already call themselves, taken from the CV. If the CV \
does not say, leave it empty rather than deciding for them.

# Dates

Copy the CV's own wording — "March 2023", "2019-06", "Summer 2021". Do not \
normalise, do not convert, do not guess a month that is not there. `end` is \
empty for a role they still hold, and `is_current` says so.
"""


def extract_user(document: CVDocument) -> str:
    """The CV as text, with the structure the parser already found."""
    lines = [
        "Read this CV into the schema.",
        "",
        "# Contact block, as parsed",
        f"name: {document.contact.name or ''}",
        f"email: {document.contact.email or ''}",
        f"phone: {document.contact.phone or ''}",
        f"location: {document.contact.location or ''}",
        f"links: {', '.join(document.contact.links)}",
        "",
        "# The document",
    ]
    for section in document.sections:
        if section.kind == "header":
            continue
        lines += ["", f"## {section.title or section.kind.title()} [{section.kind}]"]
        for node in section.loose_nodes:
            lines.append(node.text)
        for entry in section.entries:
            heading = " ".join(node.text for node in entry.heading_nodes)
            lines.append(f"### {heading}")
            lines += [f"- {bullet.text}" for bullet in entry.bullets]
    return "\n".join(lines)


async def extract_profile(
    document: CVDocument, *, client: GeminiClient
) -> tuple[CareerProfile, Usage]:
    """Read a parsed CV into a career profile."""
    completion = await client.structured(
        model=client.main_model,
        system=EXTRACT_SYSTEM,
        user=extract_user(document),
        schema=CareerProfile,
        # Low, deliberately. There is nothing to be creative about: every value
        # is supposed to already be in the document.
        temperature=0.1,
        purpose="extract_profile",
    )
    profile = completion.value

    log.info(
        "profile.extracted",
        roles=len(profile.roles),
        skills=len(profile.skills),
        education=len(profile.education),
        output_tokens=completion.usage.output_tokens,
    )
    return profile, completion.usage


# ═══════════════════════════════════════════════════════════════════════════
# Merging
# ═══════════════════════════════════════════════════════════════════════════


class Conflict(BaseModel):
    """One thing the new CV says differently from what is already on file."""

    #: Dotted path, e.g. `roles[0].title` or `identity.headline`.
    field: str
    label: str = Field(description="What this is, in words, for the person reading it.")
    existing: str
    incoming: str


class MergeResult(BaseModel):
    """The merged profile, and everything the person should look at."""

    profile: CareerProfile
    conflicts: list[Conflict] = Field(default_factory=list)
    #: What the new CV added that was not on file before, in words.
    added: list[str] = Field(default_factory=list)


def merge(existing: CareerProfile, incoming: CareerProfile) -> MergeResult:
    """Fold a newly-read CV into the profile already on file.

    Additive, and that is the whole design. Somebody who has spent ten minutes
    writing up an achievement the CV never mentioned must not lose it by
    uploading a newer CV, and that is exactly what a replace would do — quietly,
    with no way back.

    So nothing here deletes. A role that matches one already on file is filled
    in where the existing entry is blank and left alone where it is not; a role
    with no match is appended. Where the two genuinely disagree — a different
    title for the same job, a different end date — the existing value stands and
    the disagreement is reported, because the person is the only one who knows
    which is right.

    Replacing wholesale is still available and is a separate, deliberate choice
    on the screen. It is not the default, because the cost of a wrong merge is a
    duplicate row somebody deletes and the cost of a wrong replace is work they
    cannot get back.
    """
    conflicts: list[Conflict] = []
    added: list[str] = []

    merged = existing.model_copy(deep=True)

    _merge_identity(merged, incoming, conflicts, added)
    _merge_roles(merged, incoming, conflicts, added)
    _merge_education(merged, incoming, added)
    _merge_named(merged, incoming, added)

    return MergeResult(profile=merged, conflicts=conflicts, added=added)


def _merge_identity(
    merged: CareerProfile,
    incoming: CareerProfile,
    conflicts: list[Conflict],
    added: list[str],
) -> None:
    for field, label in (
        ("full_name", "Name"),
        ("headline", "Headline"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("location", "Location"),
        ("summary", "Summary"),
    ):
        new = (getattr(incoming.identity, field) or "").strip()
        old = (getattr(merged.identity, field) or "").strip()
        if not new:
            continue
        if not old:
            setattr(merged.identity, field, new)
            added.append(label)
            continue
        if _same(old, new):
            continue
        conflicts.append(
            Conflict(field=f"identity.{field}", label=label, existing=old, incoming=new)
        )

    for link in incoming.identity.links:
        if link and link not in merged.identity.links:
            merged.identity.links.append(link)


def _merge_roles(
    merged: CareerProfile,
    incoming: CareerProfile,
    conflicts: list[Conflict],
    added: list[str],
) -> None:
    for role in incoming.roles:
        match = _find_role(merged.roles, role)
        if match is None:
            merged.roles.append(role.model_copy(deep=True))
            added.append(f"Role: {role.title or 'untitled'} at {role.company or 'unknown'}")
            continue

        # Same job, seen twice. Fill the blanks, report the disagreements, and
        # never overwrite a field the person may have written themselves.
        for field, label in (
            ("title", "Job title"),
            ("company", "Employer"),
            ("location", "Location"),
            ("start", "Start date"),
            ("end", "End date"),
            ("employment_type", "Employment type"),
            ("team_size", "Team size"),
            ("what_you_did", "What you did"),
        ):
            new = (getattr(role, field) or "").strip()
            old = (getattr(match, field) or "").strip()
            if not new:
                continue
            if not old:
                setattr(match, field, new)
            elif not _same(old, new):
                conflicts.append(
                    Conflict(
                        field=f"roles[{merged.roles.index(match)}].{field}",
                        label=f"{label} — {match.title or 'a role'}",
                        existing=old,
                        incoming=new,
                    )
                )

        for technology in role.technologies:
            if technology and technology not in match.technologies:
                match.technologies.append(technology)

        # Achievements are appended rather than reconciled. A bullet reworded
        # between two versions of a CV is two ways of saying one thing, and both
        # are the person's own words — which makes both usable evidence. A
        # near-duplicate in the profile is untidy; a deleted achievement is lost.
        for achievement in role.achievements:
            if not any(_same(a.text, achievement.text) for a in match.achievements):
                match.achievements.append(achievement.model_copy(deep=True))


def _merge_education(merged: CareerProfile, incoming: CareerProfile, added: list[str]) -> None:
    for education in incoming.education:
        key = f"{education.degree} {education.institution}".strip()
        if any(_same(f"{e.degree} {e.institution}".strip(), key) for e in merged.education):
            continue
        merged.education.append(education.model_copy(deep=True))
        added.append(f"Education: {education.degree or education.institution or 'entry'}")


def _merge_named(merged: CareerProfile, incoming: CareerProfile, added: list[str]) -> None:
    """Everything whose identity is just its name: skills, certs, languages…"""
    for attribute, key, label in (
        ("skills", "name", "Skill"),
        ("certifications", "name", "Certification"),
        ("languages", "name", "Language"),
        ("projects", "name", "Project"),
        ("publications", "title", "Publication"),
        ("awards", "name", "Award"),
        ("volunteering", "organisation", "Volunteering"),
    ):
        existing_items = getattr(merged, attribute)
        seen = {_key(getattr(item, key, "")) for item in existing_items}
        for item in getattr(incoming, attribute):
            name = getattr(item, key, "")
            if not name or _key(name) in seen:
                continue
            existing_items.append(item.model_copy(deep=True))
            seen.add(_key(name))
            added.append(f"{label}: {name}")


# ── comparison ──────────────────────────────────────────────────────────────


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _same(a: str, b: str) -> bool:
    """Do these two say the same thing?

    Fuzzy on purpose. Two CVs written a year apart give "Senior Product Manager"
    and "Sr. Product Manager" for one job, and treating those as different roles
    would put the same employer on the profile twice. The threshold is high
    enough that "Product Manager" and "Product Designer" stay distinct.
    """
    left, right = _key(a), _key(b)
    if not left or not right:
        return left == right
    if left == right:
        return True
    return SequenceMatcher(None, left, right).ratio() >= 0.88


def _find_role(roles, incoming):
    """The role already on file that this one is another reading of.

    Matched on employer *and* title together. Employer alone merges two
    different jobs at the same company into one, which is the more damaging
    mistake: a promotion is exactly the thing a CV is trying to show.
    """
    for role in roles:
        if _same(role.company, incoming.company) and _same(role.title, incoming.title):
            return role
    return None


# ═══════════════════════════════════════════════════════════════════════════
# The profile as a CV
# ═══════════════════════════════════════════════════════════════════════════


def as_document(profile: CareerProfile) -> CVDocument:
    """Render the career profile as a CV document.

    So that somebody with a filled-in profile never has to find a resume file
    again. "Use what Aptly already knows" is the option that makes the profile
    worth keeping up to date, and it cannot exist unless the profile can become
    the thing the tailoring pass reads.

    Built through the same `build_document` every parser ends in, rather than by
    assembling sections directly, so this document gets the same structure
    inference, the same node-id scheme and the same contact detection as one
    read from a .docx. Every downstream feature — the preview, the validator,
    the exporter, the scorer — keeps working without knowing where it came from.

    Anchors are synthetic: there is no file on disk behind this, so the exporter
    rebuilds rather than attempting an in-place write.
    """
    from hashlib import sha256

    from aptly.ingest.builder import ParsedLine, build_document
    from aptly.model.anchors import SyntheticAnchor
    from aptly.model.style import StyleProfile

    lines: list[ParsedLine] = []
    index = 0

    def emit(text: str, *, size: float = 10.0, bold: bool = False, bullet: bool = False) -> None:
        nonlocal index
        if not text or not text.strip():
            return
        lines.append(
            ParsedLine(
                text=text.strip(),
                anchor=SyntheticAnchor(origin="redesign", index=index),
                bold=bold,
                size_pt=size,
                is_list_item=bullet,
            )
        )
        index += 1

    def heading(text: str) -> None:
        emit(text.upper(), size=12.0, bold=True)

    identity = profile.identity
    emit(identity.full_name, size=18.0, bold=True)
    if identity.headline:
        emit(identity.headline)
    if details := " | ".join(
        part for part in (identity.email, identity.phone, identity.location) if part
    ):
        emit(details)
    for link in identity.links:
        emit(link)

    if identity.summary:
        heading("Summary")
        emit(identity.summary)

    if profile.roles:
        heading("Experience")
        for role in profile.roles:
            end = role.end or ("Present" if role.is_current else "")
            emit(
                " — ".join(
                    part
                    for part in (
                        " · ".join(p for p in (role.title, role.company, role.location) if p),
                        " – ".join(p for p in (role.start, end) if p),
                    )
                    if part
                ),
                bold=True,
            )
            if role.what_you_did:
                emit(role.what_you_did)
            for achievement in role.achievements:
                emit(achievement.text, bullet=True)
            if role.technologies:
                emit(", ".join(role.technologies), bullet=True)

    if profile.projects:
        heading("Projects")
        for project in profile.projects:
            emit(" · ".join(p for p in (project.name, project.role) if p), bold=True)
            if project.description:
                emit(project.description, bullet=True)
            if project.outcome:
                emit(project.outcome, bullet=True)
            if project.technologies:
                emit(", ".join(project.technologies), bullet=True)

    if profile.education:
        heading("Education")
        for education in profile.education:
            emit(
                " — ".join(
                    part
                    for part in (
                        ", ".join(
                            p
                            for p in (
                                education.degree,
                                education.field_of_study,
                                education.institution,
                            )
                            if p
                        ),
                        " – ".join(p for p in (education.start, education.end) if p),
                    )
                    if part
                ),
                bold=True,
            )
            if education.grade:
                emit(education.grade, bullet=True)
            for highlight in education.highlights:
                emit(highlight, bullet=True)

    if profile.skills:
        heading("Skills")
        emit(", ".join(skill.name for skill in profile.skills if skill.name))

    if profile.certifications:
        heading("Certifications")
        for certification in profile.certifications:
            emit(
                " · ".join(
                    p for p in (certification.name, certification.issuer, certification.issued) if p
                ),
                bold=True,
            )

    if profile.languages:
        heading("Languages")
        emit(
            ", ".join(
                " ".join(
                    p for p in (language.name, f"({language.level})" if language.level else "") if p
                )
                for language in profile.languages
                if language.name
            )
        )

    if profile.awards:
        heading("Awards")
        for award in profile.awards:
            emit(" · ".join(p for p in (award.name, award.issuer, award.date) if p), bold=True)
            if award.description:
                emit(award.description, bullet=True)

    if profile.publications:
        heading("Publications")
        for publication in profile.publications:
            emit(
                " · ".join(
                    p for p in (publication.title, publication.venue, publication.date) if p
                ),
                bold=True,
            )
            if publication.description:
                emit(publication.description, bullet=True)

    if profile.volunteering:
        heading("Volunteering")
        for item in profile.volunteering:
            emit(" · ".join(p for p in (item.role, item.organisation) if p), bold=True)
            if item.description:
                emit(item.description, bullet=True)

    # The notes are the person's own material and the checker pools them, so a
    # rebuild may draw on them — but they are working notes rather than CV
    # prose, so they go in a section a reader would skip rather than the summary.
    if profile.notes.strip():
        heading("Notes")
        for note in profile.notes.splitlines():
            emit(note)

    body = "\n".join(line.text for line in lines)
    who = (identity.full_name or "Aptly-Resume").replace(" ", "-")

    return build_document(
        lines,
        doc_id=sha256(body.encode()).hexdigest()[:16],
        source_format="txt",
        source_filename=f"{who}.txt",
        content_hash=sha256(body.encode()).hexdigest(),
        style_profile=StyleProfile(),
    )
