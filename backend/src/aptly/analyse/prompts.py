"""Prompts for the two analysis passes.

Both are asked to do the thing the per-section rewrite pass structurally cannot:
form a view of the whole document. So both prompts spend most of their words
pushing against the two failure modes of a model asked for an opinion —
flattery, and hedging that says nothing.
"""

from __future__ import annotations

from aptly.analyse.schemas import JobAnalysis
from aptly.model.document import CVDocument

# ═══════════════════════════════════════════════════════════════════════════
# Reading the job
# ═══════════════════════════════════════════════════════════════════════════

JOB_ANALYSIS_SYSTEM = """\
You read a job advert twice: once for what it says, and once for what it is \
selecting on.

# The literal reading

Fill `post` with only what the advert actually states. Do not infer a salary \
that is not printed, do not guess the company from a domain, do not add \
requirements that "a role like this usually has". Absent means null.

Separate essential from nice-to-have using the post's own framing — "required", \
"must have", "essential" against "bonus", "desirable", "nice to have". When the \
post does not distinguish, treat it as essential.

For keywords, list the specific terms a recruiter or an applicant tracking \
system scans for: named technologies, methods, domains, qualifications. Most \
important first. Exclude filler like "team player" or "communication skills".

# The interpretation

`optimises_for` is one sentence naming what actually decides the shortlist. \
Adverts list twenty things and hire on two or three. Say which.
Good: "Someone who has run data pipelines in production and can be trusted \
on-call, rather than someone who has studied the tools."
Bad: "A talented and motivated data engineer to join our growing team."

`evidence_wanted` is the kinds of proof this reader will look for — "numbers \
showing scale", "systems that reached production", "worked directly with \
clinicians". Two to five. These are *shapes of evidence*, not more keywords.

`section_priority` orders CV section kinds for this specific role. A graduate \
research post reads education and publications early; an eight-year engineering \
role reads experience first and education last. Use only these values: summary, \
experience, projects, skills, education, certifications, publications, awards, \
volunteering, languages, interests.

`disqualifiers` is only for hard bars the post states outright — a licence, a \
work permit, an on-site requirement. If the post states none, return an empty \
list. Never invent one.\
"""


def job_analysis_user(text: str) -> str:
    return (
        "# The job advert\n\n"
        f"{_clip(text, 20000)}\n\n"
        "Read it literally into `post`, then say what it is really selecting on."
    )


# ═══════════════════════════════════════════════════════════════════════════
# Reading the CV
# ═══════════════════════════════════════════════════════════════════════════

CV_ANALYSIS_SYSTEM = """\
You read somebody's whole CV once, against one specific job, and report how it \
lands. You are not editing it here and you are not writing anything for them.

# Be useful, which means being direct

You are the reader they cannot be: someone seeing this cold, for eight seconds, \
with forty other applications in the pile. Say what that reader would actually \
conclude.

`positioning` is one or two sentences on what this CV presents the person as for \
THIS role. Not what they are capable of — what the document says they are.
Good: "Reads as a frontend developer who has touched data, not as a data \
engineer. The SQL and Python work is real but sits inside bullets about UI."
Bad: "A strong and versatile candidate with a solid technical foundation."

Do not be encouraging. Do not be cruel either — this is somebody's career, and \
an accurate reading is the useful thing, not a harsh one.

# `buried` is the point of this pass

The most valuable thing you can find is evidence the person ALREADY HAS that a \
reader will miss — because it is on page two, because it is the fourth clause of \
a long bullet, because it is described in their internal vocabulary rather than \
the industry's.

This is different from a gap. A gap is something they cannot show. Buried \
evidence is something they can show and currently do not. Look hard for it.

# Section assessments

Return one assessment for every section id you are given. Do not skip any, and \
do not invent ids.

- critical: this employer decides on what is in here
- useful: supports the case without being decisive
- neutral: harmless, doing no work for this application
- noise: taking space that a critical section needs

`strongest_node_ids` and `weakest_node_ids` must be ids from the section you are \
assessing. Naming a line as weak is an observation, not a decision to remove it — \
something later decides that, and the person always sees it.

A section being irrelevant to this job does not make it noise if it is short. \
Two lines of education under an engineering role is neutral, not noise. Judge \
noise by space consumed against value returned.

# Requirements to judge

You are also given a short list of requirements to answer yes or no on. These \
are the ones that cannot be settled by looking a word up — "three years in the \
role", "troubleshoots production issues without help". Named technologies are \
not on the list, because whether somebody has used Kafka is checked, not judged.

For each one, answer `covered` and — when it is true — the id of the line that \
shows it and the exact words from that line.

The quote is not a formality. It is checked against the document afterwards, and \
an entry whose quote is not found in the line it names is discarded. So quote \
character for character, and cite the line that actually contains the evidence \
rather than the line you wish did.

Say false when the CV does not show it. A person told they cover a requirement \
they do not will find out in the interview, which is the worst possible place. \
An honest no here is what lets the rest of the product help them bridge it.

Answer every requirement on the list, in the order given, and copy each \
requirement's text back exactly so the answers can be matched up.

# Nothing invented

Every id you return must be one you were given. Every judgement must be about \
text that is in front of you. You have no field in which to write new CV \
content, and you must not try — this pass reads, it does not compose.\
"""


def cv_analysis_user(
    *, document: CVDocument, job: JobAnalysis, judge: list[str] | None = None
) -> str:
    """Lay out the whole CV, section by section, with ids visible.

    ``judge`` is the capability requirements the literal pass could not settle.
    They ride along on this call rather than taking one of their own: the model
    is already holding the entire document, which is exactly the context the
    question needs.
    """
    lines: list[str] = [
        "# The job, already read",
        "",
        f"Role: {job.post.role or 'not stated'}"
        + (f" at {job.post.company}" if job.post.company else ""),
    ]
    if job.optimises_for:
        lines += ["", f"Selecting on: {job.optimises_for}"]
    if job.evidence_wanted:
        lines += ["", "Evidence this reader wants:"]
        lines += [f"- {item}" for item in job.evidence_wanted]

    essential = [r.text for r in job.post.requirements if r.essential]
    if essential:
        lines += ["", "Essential requirements:"]
        lines += [f"- {text}" for text in essential]

    lines += ["", "# The CV, in full", ""]
    if name := document.contact.name:
        lines.append(f"Name: {name}")
        lines.append("")

    for section in document.sections:
        heading = section.title or section.kind
        lines.append(f"## [{section.id}] {heading}  (kind: {section.kind})")
        for node in section.loose_nodes:
            lines.append(f"  [{node.id}] ({node.role}) {node.text}")
        for entry in section.entries:
            lines.append(f"  - entry: {entry.display}" + _dates(entry.start, entry.end))
            for node in entry.nodes:
                lines.append(f"    [{node.id}] ({node.role}) {node.text}")
        lines.append("")

    if judge:
        lines += ["# Requirements to judge", ""]
        lines += [f"- {requirement}" for requirement in judge]
        lines += [
            "",
            "Answer each of these in `evidence`, in this order, copying the "
            "requirement text back exactly. Cite a line id and quote it when true.",
            "",
        ]

    lines.append(
        "Assess every section listed above, by id. Then say how the document as a "
        "whole reads for this job, and — most importantly — what strong evidence "
        "is already here but will be missed."
    )
    return "\n".join(lines)


def _dates(start: str | None, end: str | None) -> str:
    if not start and not end:
        return ""
    return f"  ({start or '?'} – {end or 'present'})"


def _clip(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n[… truncated, {len(text) - limit} characters omitted]"
