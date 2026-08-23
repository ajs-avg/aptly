"""The redesign prompt.

The schema already makes fabrication impossible — there is nowhere to write new
CV text. So this prompt spends its words on the two things the schema cannot
enforce: making the plan *worth applying*, and keeping the drops defensible.
"""

from __future__ import annotations

from aptly.analyse.schemas import Analysis
from aptly.model.document import CVDocument

REDESIGN_SYSTEM = """\
You restructure a CV for one specific job. You move things; you do not write \
things.

# What you can do

Reorder the sections. Reorder the jobs inside a section. Reorder the bullets \
inside a job. Rename a section heading. Leave out a section or a line that is \
not earning its space for this application.

That is the whole vocabulary, and it is deliberate. You have no way to add a \
bullet, invent a skill or write a summary, because a restructure that could do \
those things would be a fabrication with extra steps. The wording is improved \
separately, by a pass that has to quote its source for every change.

# The one question

A recruiter gives this document about eight seconds before deciding whether to \
read it properly. Your job is to make those eight seconds land on the strongest \
true evidence this person has for THIS job.

So: what is currently in the first third of page one, and what should be?

# Ordering

Lead with what this employer decides on. For most experienced roles that is the \
work history; for a research post it may be publications; for a career-changer \
the relevant projects may genuinely outrank an unrelated job history.

Inside a section, most-relevant-first beats strictly-most-recent-first when the \
two disagree — but not by much, and never at the cost of making the timeline \
look evasive. Reordering jobs out of date order is a strong move and needs a \
strong reason.

Inside a job, the bullet that answers this post's main requirement goes first. \
This is the single highest-value reordering available to you and it is almost \
always worth making.

# Renaming

Only to a conventional heading a reader and an applicant tracking system both \
recognise: "Work Experience", "Technical Skills", "Projects". Never to a claim. \
Retitling a frontend job history as "Data Engineering Experience" is a lie told \
in a heading, and it is the kind that gets found out in the first two minutes \
of a phone screen.

# Dropping

You may leave things out. Be conservative and be specific.

Drop something when it takes space a stronger section needs — an unrelated \
certification, an interests section, a bullet that repeats the one above it, a \
job from fifteen years ago in an unrelated field.

Do NOT drop:
- anything that shows the person is contactable
- a whole work history, or the only education section
- a skill or a technology, on the grounds that this post did not ask for it. \
Another reader is looking for it, and the person still has it.
- something merely because it is old. Length of history is evidence too.

Every drop needs a reason the person will read and be able to disagree with. \
Write the argument, not the verdict: "This certification is frontend-specific \
and the space reads better as another project bullet" — not "irrelevant".

If dropping nothing is right, drop nothing. An empty list is a legitimate answer \
and a much better one than a cut you cannot justify.

# The intent field

One or two sentences on what the document will say at a glance after these \
changes that it does not say now. If you cannot write that sentence, your plan \
is not doing enough.\
"""


def redesign_user(*, document: CVDocument, analysis: Analysis) -> str:
    """Everything the planner needs: the job, the reading of the CV, the shape."""
    job = analysis.job
    lines: list[str] = ["# The job", ""]
    header = " · ".join(part for part in (job.post.role, job.post.company) if part)
    if header:
        lines.append(header)
    if job.optimises_for:
        lines += ["", f"Selecting on: {job.optimises_for}"]
    if job.section_priority:
        lines += ["", "Sections this reader wants, in order: " + " > ".join(job.section_priority)]
    if job.evidence_wanted:
        lines += ["", "Evidence they look for:"]
        lines += [f"- {item}" for item in job.evidence_wanted]

    lines += ["", "# How this CV currently reads", "", analysis.cv.positioning or "(no reading)"]

    if analysis.cv.buried:
        lines += [
            "",
            "## Strong evidence a reader will currently miss",
            "This is the material your reordering exists to surface.",
        ]
        lines += [f"- {item}" for item in analysis.cv.buried]

    covered = analysis.gaps.covered
    missing = [gap for gap in analysis.gaps.missing if gap.essential]
    if covered:
        lines += ["", "## Requirements this CV genuinely answers", ""]
        lines += [f"- {gap.requirement}" for gap in covered]
    if missing:
        lines += [
            "",
            "## Requirements it does not answer",
            "Reordering cannot fix these. Do not try to hide them by burying a "
            "section — just make sure the space goes to what does answer.",
            "",
        ]
        lines += [f"- {gap.requirement}" for gap in missing]

    lines += ["", "# The document's shape", ""]
    lines.append(
        "Section and entry ids are what your operations address. Every id you "
        "return must appear below, exactly as written."
    )
    lines.append("")

    for section in document.sections:
        assessment = analysis.cv.assessment(section.id)
        verdict = f"  [{assessment.relevance}] {assessment.verdict}" if assessment else ""
        lines.append(f"## [{section.id}] {section.title or section.kind}  (kind: {section.kind})")
        if verdict:
            lines.append(verdict)
        for node in section.loose_nodes:
            lines.append(f"  [{node.id}] ({node.role}) {_clip(node.text, 160)}")
        for entry in section.entries:
            lines.append(f"  entry [{entry.id}] {entry.display}{_dates(entry.start, entry.end)}")
            for bullet in entry.bullets:
                lines.append(f"    [{bullet.id}] {_clip(bullet.text, 160)}")
        lines.append("")

    lines.append(
        "Now plan the restructure. Reordering the sections and the bullets inside "
        "the most relevant job is usually where nearly all the value is. Drop only "
        "what you can argue for."
    )
    return "\n".join(lines)


def _dates(start: str | None, end: str | None) -> str:
    if not start and not end:
        return ""
    return f"  ({start or '?'} – {end or 'present'})"


def _clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else f"{text[: limit - 1]}…"
