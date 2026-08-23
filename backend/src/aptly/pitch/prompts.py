"""The call-preparation prompt."""

from __future__ import annotations

from aptly.analyse.schemas import Analysis
from aptly.model.document import CVDocument

PITCH_SYSTEM = """\
You prepare somebody for a first call about a job they have applied for.

They will have this open in front of them while a recruiter talks. Write for \
that: short, concrete, sayable out loud. No headings inside fields, no \
paragraphs where a sentence works, nothing they would be embarrassed to be \
caught reading.

# Evidence, always

Every entry in `why_you_fit` must quote the words on their CV that support it. \
The recruiter is looking at that document; a claim that is not on it is a claim \
the person has to defend from memory. Points whose evidence is not found on the \
page are deleted before they see this.

# The gaps are the point

`gaps_to_own` lists every essential requirement they do not meet. Do not \
shorten this list to be kind and do not soften the entries.

For each, write what to actually say. The shape that works: name it plainly, \
give the nearest real thing they have done, say what it would take. \
"I have not used Airflow. I have written the scheduling and retry logic for our \
nightly reconciliation job in cron and Python, so the concepts are familiar — \
I would expect a week to be useful in it."

Never write a deflection, never claim transferable skills as equivalence, and \
never suggest implying something. People are hired with gaps every day. They \
are not hired after being caught covering one.

# Tone

Their register, not a salesperson's. No "passionate", no "excited by the \
opportunity", no "proven track record". If a sentence would sound false said \
out loud, it is wrong.\
"""


def pitch_user(*, document: CVDocument, analysis: Analysis) -> str:
    job = analysis.job
    lines: list[str] = ["# The job", ""]
    header = " · ".join(p for p in (job.post.role, job.post.company, job.post.location) if p)
    if header:
        lines.append(header)
    if job.optimises_for:
        lines += ["", f"Selecting on: {job.optimises_for}"]

    covered = [g.requirement for g in analysis.gaps.covered]
    partial = [g.requirement for g in analysis.gaps.partial]
    missing = [g.requirement for g in analysis.gaps.missing if g.essential]

    if covered:
        lines += ["", "## Requirements they meet", ""] + [f"- {r}" for r in covered]
    if partial:
        lines += ["", "## Partly met — be precise about the boundary", ""]
        lines += [f"- {r}" for r in partial]
    if missing:
        lines += ["", "## Essential requirements they do NOT meet", ""]
        lines += [f"- {r}" for r in missing]
        lines.append("")
        lines.append("Every one of these needs an entry in gaps_to_own.")

    lines += ["", "# The CV they are sending", "", document.plain_text(), ""]
    lines.append(
        "Prepare them for the call. Quote this CV for every fit point, and be "
        "straight with them about the gaps."
    )
    return "\n".join(lines)
