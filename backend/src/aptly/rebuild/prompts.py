"""The rebuild prompt.

Unlike the tailoring prompt, this one is allowed to compose. So it spends its
words on the two failures that follow from that: writing things the person never
said, and writing a document that reads like every other AI CV.
"""

from __future__ import annotations

from aptly.analyse.schemas import Analysis
from aptly.model.document import CVDocument
from aptly.profile.schemas import CareerProfile

REBUILD_SYSTEM = """\
You write somebody a complete CV for one specific job, using only what they have \
told you about themselves.

# What you are given

Their existing CV, their career profile, and — sometimes — a Story Bank. \
Together these are *their material*. You are also given a reading of the job \
and of how their current CV lands.

You choose everything about the document: which sections it has, what order they \
come in, which of their experience earns space, and how every line reads.

# The one rule

**Only say things they have said.** Every line you write must be traceable to a \
sentence in their material, and you must quote that sentence in `drawn_from`.

You may: rephrase, combine two things they said into one line, use the \
employer's word for something they genuinely did, put a number they gave you \
next to the achievement it belongs to, and leave things out.

You may not: add a tool, technology, employer, client, qualification or \
certification that is not in their material; add, round or adjust any figure; \
upgrade a job title; turn "helped with" into "led"; claim an outcome where they \
described an activity; or write a line whose source you cannot quote.

Every line is checked against their material after you write it. Lines that \
introduce a name, a number or a technology they never mentioned are deleted \
before the person sees them — so an invented line does not fool anybody, it just \
leaves a hole where a real line could have been.

If their material is thin, the CV you write is short. A short true CV is worth \
more than a full invented one, and this is not the place to be generous.

# The headline

`headline` is an identity claim and the first thing a phone screen tests. Use \
something they already call themselves. A frontend developer applying for a data \
role is a frontend developer; you may lead with the data work in the summary, \
you may not relabel the person.

# Structure

Order sections by what decides this hiring decision, not by convention. Lead \
with what the employer is selecting on.

Inside experience, most recent first unless there is a strong reason otherwise, \
and never in a way that makes the timeline look evasive. Inside an entry, the \
bullet that answers this post's main requirement comes first.

Give the strongest role the most bullets. A role from eight years ago in an \
unrelated field gets one line or none.

Skills belong in a compact, scannable section, grouped, with what this post asks \
for first — but never dropping something they have because this post did not \
ask for it. Another reader is looking for it.

**Every term listed under "Terms this post is scored on" that appears anywhere \
in their material must appear in your CV, spelled the same way.** Leaving one \
out is the single most damaging thing you can do here: the document is scored on \
whether those words are present, so dropping one you were given costs them the \
requirement outright — and it is a requirement they actually meet.

# Writing

Do not sound like an AI CV. Never use: spearheaded, leveraged, utilised, \
orchestrated, championed, passionate, results-driven, dynamic, seasoned, \
synergy, seamless, cutting-edge, best-in-class, proven track record, \
instrumental in, responsible for a variety of.

Instead:
- keep their register. If their writing is short and plain, so is yours.
- lead with what happened, not with a verb chosen to impress
- one idea per bullet
- keep the concrete detail — the numbers, the tool names, the scale. It is what \
makes a CV read as a person rather than a template.
- name the scale that is already there: "30 stores", not "multiple sites"
- never write "demonstrating", "showcasing", "highlighting my" or "which \
proves". A bullet shows the experience; it does not announce it.

# Empty fields stay empty

If you do not know a date, a location or an employer, leave the field as an empty string. Never write "Not specified", "N/A", "Unknown" or a dash. Those reach the finished CV as literal text, and a line reading "Web Developer — Not specified – Not specified" is worse than one with no dates at all: it draws the reader's eye to a gap they would not have noticed, and makes the document look machine-made.

# The summary is a paragraph

The summary section takes *one* line: a short paragraph, two or three sentences. Do not split it into a list of one-sentence fragments — "Experienced in X." / "Proficient in Y." / "Focused on Z." reads as notes towards a CV rather than a CV, and a recruiter skims past it.

Everywhere else, one idea per line, as bullets.

# Length

Aim for a document that fills one page well, or two if their history genuinely \
needs it. Do not pad to reach a length, and do not compress until the specifics \
are gone.\
"""


def rebuild_user(
    *,
    document: CVDocument,
    profile: CareerProfile | None,
    analysis: Analysis,
    stories: dict[str, str] | None = None,
) -> str:
    """Everything the person has said, plus the reading of the job."""
    job = analysis.job
    lines: list[str] = ["# The job", ""]
    header = " · ".join(
        part for part in (job.post.role, job.post.company, job.post.location) if part
    )
    if header:
        lines.append(header)
    if job.optimises_for:
        lines += ["", f"Selecting on: {job.optimises_for}"]
    if job.evidence_wanted:
        lines += ["", "Evidence they look for:"]
        lines += [f"- {item}" for item in job.evidence_wanted]
    if job.section_priority:
        lines += ["", "Section order this reader expects: " + " > ".join(job.section_priority)]

    essential = [r.text for r in job.post.requirements if r.essential]
    if essential:
        lines += ["", "Essential requirements:"]
        lines += [f"- {text}" for text in essential]

    covered = [gap.requirement for gap in analysis.gaps.covered]
    missing = [gap.requirement for gap in analysis.gaps.missing if gap.essential]
    if covered:
        lines += ["", "## Requirements they genuinely meet — make these unmissable", ""]
        lines += [f"- {item}" for item in covered]
    if missing:
        lines += [
            "",
            "## Requirements they do not meet",
            "Do not write around these and do not imply them. Give the space to what they do have.",
            "",
        ]
        lines += [f"- {item}" for item in missing]

    scored = _scored_terms(analysis)
    if scored:
        lines += [
            "",
            "## Terms this post is scored on",
            "Any of these that appears in their material below must appear in your "
            "CV, spelled the same way. Do not add one that does not.",
            "",
            ", ".join(scored),
        ]

    if analysis.cv.buried:
        lines += ["", "## Evidence a reader currently misses — bring it forward", ""]
        lines += [f"- {item}" for item in analysis.cv.buried]

    lines += ["", "=" * 60, "# THEIR MATERIAL — the only thing you may draw on", "=" * 60, ""]
    lines += ["## Their current CV", "", document.plain_text(), ""]

    if profile is not None and not profile.is_empty:
        lines += ["## Their career profile", "", _profile_block(profile), ""]
    else:
        lines += [
            "## Their career profile",
            "",
            "(not filled in — you have only the CV above, so keep the rebuild short "
            "rather than padding it)",
            "",
        ]

    if stories:
        lines += ["## Their Story Bank", ""]
        lines += [f"- {text}" for text in stories.values()]
        lines.append("")

    lines.append(
        "Now write their CV for this job. Every line needs a quote in `drawn_from` "
        "taken from the material above."
    )
    return "\n".join(lines)


def _scored_terms(analysis: Analysis) -> list[str]:
    """The exact names the gap map looks for.

    The instruction not to drop a relevant skill was already in the system
    prompt, and it could not be followed: the model was never told which terms
    were being counted. It was guessing at a list it had never seen, and every
    guess that trimmed one cost a requirement the person genuinely met — which
    is most of why a purpose-written CV kept scoring below the one it replaced.
    """
    seen: set[str] = set()
    terms: list[str] = []
    for requirement in analysis.job.post.requirements:
        for keyword in requirement.keywords:
            key = keyword.strip().lower()
            if key and key not in seen:
                seen.add(key)
                terms.append(keyword.strip())
    for keyword in analysis.job.post.keywords:
        key = keyword.strip().lower()
        if key and key not in seen:
            seen.add(key)
            terms.append(keyword.strip())
    return terms


def _profile_block(profile: CareerProfile) -> str:
    """The profile as readable prose rather than as a JSON dump.

    A model reads a labelled outline far better than it reads serialised
    objects, and the difference shows up directly in how much of the profile
    actually reaches the finished document.
    """
    out: list[str] = []
    identity = profile.identity
    if identity.full_name:
        out.append(f"Name: {identity.full_name}")
    for label, value in (
        ("Calls themselves", identity.headline),
        ("Location", identity.location),
        ("Open to relocation", "yes" if identity.open_to_relocation else ""),
        ("Work authorisation", identity.work_authorisation),
        ("Email", identity.email),
        ("Phone", identity.phone),
    ):
        if value:
            out.append(f"{label}: {value}")
    if identity.links:
        out.append("Links: " + ", ".join(identity.links))
    if identity.summary:
        out += ["", "In their own words:", identity.summary]

    if profile.roles:
        out += ["", "### Roles"]
        for role in profile.roles:
            when = f"{role.start} – {'Present' if role.is_current else role.end or '?'}"
            out.append(f"\n**{role.title or '?'}**, {role.company or '?'} ({when})")
            for label, value in (
                ("Location", role.location),
                ("Type", role.employment_type),
                ("Team", role.team_size),
            ):
                if value:
                    out.append(f"  {label}: {value}")
            if role.what_you_did:
                out.append(f"  What they did: {role.what_you_did}")
            if role.technologies:
                out.append("  Technologies: " + ", ".join(role.technologies))
            for achievement in role.achievements:
                metric = f" [{achievement.metric}]" if achievement.metric else ""
                out.append(f"  - {achievement.text}{metric}")

    if profile.projects:
        out += ["", "### Projects"]
        for project in profile.projects:
            out.append(f"\n**{project.name or '?'}** — {project.description}")
            if project.role:
                out.append(f"  Their part: {project.role}")
            if project.technologies:
                out.append("  Technologies: " + ", ".join(project.technologies))
            if project.outcome:
                out.append(f"  Outcome: {project.outcome}")

    if profile.skills:
        out += ["", "### Skills (self-rated)"]
        out += [
            f"- {skill.name}"
            + (f" — {skill.proficiency}" if skill.proficiency else "")
            + (f", {skill.years}" if skill.years else "")
            for skill in profile.skills
        ]

    if profile.education:
        out += ["", "### Education"]
        for education in profile.education:
            bits = " ".join(
                filter(None, [education.degree, education.field_of_study, education.institution])
            )
            out.append(f"- {bits} ({education.start} – {education.end}) {education.grade}".strip())
            out += [f"    {item}" for item in education.highlights]

    for label, items in (
        ("Certifications", [f"{c.name} — {c.issuer} ({c.issued})" for c in profile.certifications]),
        ("Languages", [f"{lang.name} — {lang.level}" for lang in profile.languages]),
        ("Publications", [f"{p.title} — {p.venue} ({p.date})" for p in profile.publications]),
        ("Awards", [f"{a.name} — {a.issuer} ({a.date})" for a in profile.awards]),
        (
            "Volunteering",
            [f"{v.role} at {v.organisation} — {v.description}" for v in profile.volunteering],
        ),
    ):
        if items:
            out += ["", f"### {label}"]
            out += [f"- {item}" for item in items]

    preferences = profile.preferences
    wanted = [
        ("Target roles", ", ".join(preferences.target_roles)),
        ("Industries", ", ".join(preferences.target_industries)),
        ("Seniority", preferences.seniority),
        ("Notice period", preferences.notice_period),
    ]
    stated = [f"{label}: {value}" for label, value in wanted if value]
    if stated:
        out += ["", "### What they are looking for"]
        out += [f"- {item}" for item in stated]
        out.append("  (context for you — never printed on the CV as a claim)")

    if preferences.avoid:
        out.append("  Do not put them forward for: " + ", ".join(preferences.avoid))

    if profile.notes:
        out += ["", "### Anything else they said", profile.notes]

    return "\n".join(out)
