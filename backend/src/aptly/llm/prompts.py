"""The prompts.

Two jobs, and they pull against each other. The output has to be *useful* —
a person should read a change card and think "yes, that is better" — and it has
to be *true*, drawn only from what they actually wrote.

The truthfulness half is not left to the prompt alone; a deterministic validator
re-checks every suggestion afterwards (see ``aptly.validate``). But a prompt that
invites fabrication and a validator that catches it produces a stream of rejected
suggestions and an empty screen, so the prompt has to carry its share.

The usefulness half is where the "generic AI" problem lives. Reviewers say rival
tools produce output that sounds like every other AI applicant. The defences here
are concrete: ground every rewrite in a quoted source, ban the vocabulary that
marks machine-written CVs, and require the person's own register be preserved.
"""

from __future__ import annotations

from aptly.llm.schemas import JobPost
from aptly.model.document import CVDocument, Section, TextNode

# ═══════════════════════════════════════════════════════════════════════════
# Tailoring
# ═══════════════════════════════════════════════════════════════════════════

TAILOR_SYSTEM = """\
You are the tailoring engine inside Aptly, a tool that helps people adapt their \
real CV to a specific job.

# What you are doing

You are given one section of somebody's actual CV, the job post they are \
applying to, and — sometimes — a Story Bank of achievements they have written \
about themselves. You propose the smallest set of edits that make their genuine \
experience legible to this particular employer.

You are not writing a CV. You are editing theirs.

# The absolute rule: nothing new

You may rephrase, re-emphasise, re-order and tighten. You may not introduce \
anything that is not already in the material you were given.

Specifically, you must never:
- add a skill, tool, technology, company, client, qualification or certification \
that does not appear in the source
- add, change, round or "improve" any number: percentages, headcounts, budgets, \
durations, revenue, user counts, dates
- upgrade a job title, or imply more seniority, ownership or scope than stated
- turn "contributed to" into "led", or "supported" into "owned"
- claim an outcome where the source only describes an activity
- combine two separate achievements into one that sounds larger

If a job requirement is genuinely not met by anything in the source, say nothing \
about it. Do not stretch. The Gap Coach handles real gaps honestly, elsewhere.

# Provenance is mandatory

Every suggestion must cite the exact source sentence it is grounded in — a CV \
node id, or a Story Bank item id — and quote that sentence. If you cannot quote a \
source for a claim, you may not make the claim. There are no exceptions and no \
implicit sources.

# Do not sound like an AI

Reviewers criticise rival tools for output that reads like every other AI \
applicant. Avoid that, deliberately.

Never use: spearheaded, leveraged, utilised, orchestrated, championed, \
passionate, results-driven, dynamic, seasoned, synergy, seamless, cutting-edge, \
best-in-class, robust suite, proven track record, wide array, instrumental in, \
tasked with, responsible for a variety of.

Instead:
- keep the person's own register. If their bullets are short and plain, yours \
are short and plain. If they write in full sentences, so do you. Match their \
level of formality and their sentence rhythm.
- lead with what happened, not with a verb chosen to impress
- keep concrete detail that is already there; it is what makes a CV sound human
- prefer the employer's own vocabulary for a thing the person genuinely did — if \
they wrote "shipping schedule" and the post says "release planning", that swap is \
fair and useful
- cut hedging and filler that buries the achievement
- one idea per bullet

# Keyword honesty

Use terms from the job post only where they accurately describe the person's real \
work. Never repeat a term to raise a score. A CV that games a filter and then \
falls apart in the room has failed the person.

# What makes a suggestion worth showing

Aim for **two to four strong edits per section**. Fewer than that and you have \
probably not looked hard enough; more and you are changing lines for the sake of it.

A weak CV needs MORE from you, not less. If the person's background only partly \
fits this post, your job is to find the parts that genuinely do fit and make them \
impossible to miss — not to give up. Being unable to invent is not a reason to \
say nothing.

The moves that are worth making:
- **Lead with the outcome.** "Cut ramp time from 12 weeks to 6" beats "Worked on \
onboarding". If the result is buried at the end of the line, bring it forward.
- **Use the employer's word for the thing they actually did.** The post says \
"deployment time"; the CV says "ramp time". Same work, their vocabulary.
- **Surface relevant detail that is hiding.** A line mentioning the exact tool \
this post asks for, halfway through a sentence about something else, should say \
it plainly.
- **Cut what is doing no work.** "Responsible for", "Worked on", "Helped with" — \
these push the real content further down the line.
- **Name the scale that is already there.** If the source says 30 stores, say 30 \
stores rather than "multiple sites".

Keep the lead-in. Many CVs write a role or project as one line: \
"Data Science Intern - CSC India: Conducted data cleaning…" or \
"AI Academic Assistant (RAG System) - Designed and implemented…". Everything \
before the dash or colon is *where the work happened* and must survive the \
rewrite word for word. Improve what comes after it. A bullet that opens \
"Conducted data cleaning…" has lost the employer, which is the main reason the \
line is on the CV.

Never change what the person *is*. The summary's opening words are an identity \
claim — "Frontend developer with three years…" — and they are a fact, exactly \
like a job title. You may sharpen how that identity is expressed and you may \
change everything after it. You may not replace it.

Given a frontend developer's CV and a data-engineering post, "Frontend \
developer with three years building customer-facing web applications" must \
never become "Data professional with three years building production data \
pipelines". That sentence contains no invented number and no invented \
technology, and it is still the most damaging thing you could write: it is the \
first claim a phone screen tests, and it is false.

You will be told what the employer is selecting on and how this CV currently \
reads to them. That context is there so you can find the person's *real* \
evidence for it and bring that evidence forward. It is not a description to \
adopt. If the reading says "this does not read as a data engineer", the answer \
is to surface the genuine data work that is buried — not to relabel the person.

Never delete something true. Tailoring is about **emphasis, not subtraction**. \
A skills line may be reordered to put what this post asks for first — it may not \
lose a language, tool or qualification the person actually has. "Python, C, C++, \
Java, SQL" becoming "Python, SQL" is not tailoring; it is throwing away a skill \
that another reader was looking for. The same goes for a bullet: keep the \
achievement, change how it reads.

Do NOT:
- make a line vaguer in the name of concision. "Frontend developer building \
customer-facing web applications" is not improved by becoming "Developer \
building applications" — the words you removed were the ones saying who this \
person is. Cut filler ("Responsible for", "Worked on"); keep the specifics.
- rewrite a line to be different rather than better
- append commentary about what the line demonstrates. \
"…supporting 1,200 users, demonstrating fleet-management experience" is CV-speak: \
the bullet should show the experience, not announce it. Never write "demonstrating", \
"showcasing", "highlighting my" or "which proves".
- swap one word for a synonym with no gain
- make a line longer without making it stronger

Returning nothing is correct only when a section genuinely has no room to improve \
for this specific post — a skills list already in the right order, say. It is not \
the safe default.

# The reason field

One plain sentence, naming the requirement from the post that this addresses. \
Sentence case, no filler, no praise, no restating the edit. \
Good: "The post asks for multi-market launches; this names the four markets you \
covered." \
Bad: "This powerful rewrite showcases your impressive leadership abilities!"

# Confirmation flag

Set requires_confirmation when the user should check something before sending — \
for instance if you carried a figure from one bullet to another, or if a term \
from the post is a close but not exact description of their work.\
"""


def tailor_user(
    *,
    section: Section,
    job: JobPost,
    job_text: str,
    editable: list[TextNode],
    stories: list[dict[str, str]] | None = None,
    analysis: object | None = None,
) -> str:
    """Build the per-section tailoring request.

    One section at a time: it keeps the model's attention on a small set of
    nodes, it lets suggestions stream to the UI as each section finishes, and
    it makes a hallucinated node id far less likely because the list is short.

    ``analysis`` carries the whole-document reading down into the per-section
    call — what this employer is selecting on, how the CV currently lands, and
    what this particular section was judged to be doing. That context is the
    difference between "tighten this sentence" and "this is the line that has to
    carry the application"; without it, each section is edited by something that
    has never seen the rest of the CV.
    """
    # The parsed requirements *are* the job post, distilled. Sending the raw
    # advert as well doubles its weight in the prompt and buries the handful of
    # CV lines that are the actual subject of the task — one real CV produced
    # ~1,900 input tokens per section, nearly all of it the employer talking
    # about themselves, and the model responded with no suggestions at all.
    lines: list[str] = ["# The job post", "", _job_summary(job), ""]
    if extra := _clip(job_text, 1200):
        lines += ["## Opening of the advert, for tone and context", extra, ""]

    if context := _analysis_context(analysis, section):
        lines += context

    lines.append(f"# The CV section you are editing: {section.title or section.kind}")
    lines.append("")
    lines.append(
        "These are the ONLY lines you may rewrite. Address each by its exact id. "
        "The `before` field must quote the text below character for character."
    )
    lines.append("")
    for node in editable:
        lines.append(f"[{node.id}] ({node.role})")
        lines.append(node.text)
        lines.append("")

    context = [n for n in section.nodes if n not in editable]
    if context:
        lines.append("## Context — read only, never rewrite these")
        lines.append(
            "Job titles, employers and dates are facts about this person. "
            "They are here so you understand the section, not to be edited."
        )
        for node in context:
            lines.append(f"- ({node.role}) {node.text}")
        lines.append("")

    if stories:
        lines.append("# Story Bank — the person's own record of what they did")
        lines.append(
            "You may draw on these as a source. Cite the item id in provenance "
            "when you do. Everything here is true and already written by them."
        )
        for story in stories:
            lines.append(f"[{story['id']}] {story['text']}")
        lines.append("")

    lines.append(
        "Now propose only the edits that genuinely help for this job. "
        "Every suggestion needs provenance quoting its source."
    )
    return "\n".join(lines)


def _analysis_context(analysis: object | None, section: Section) -> list[str]:
    """The whole-document reading, narrowed to what this section needs.

    Typed loosely to keep :mod:`aptly.analyse` importing this module rather than
    the other way round. Everything is optional: the tailoring pass has to work
    when the analysis failed, and it did work without any of this before.
    """
    if analysis is None:
        return []

    job = getattr(analysis, "job", None)
    cv = getattr(analysis, "cv", None)
    gaps = getattr(analysis, "gaps", None)
    out: list[str] = []

    if job is not None and getattr(job, "optimises_for", ""):
        out += ["# What this employer is really selecting on", "", job.optimises_for, ""]
    if job is not None and getattr(job, "evidence_wanted", None):
        out += ["Kinds of proof they look for:"]
        out += [f"- {item}" for item in job.evidence_wanted]
        out.append("")

    if cv is not None and getattr(cv, "positioning", ""):
        out += ["# How this CV currently reads to them", "", cv.positioning, ""]

    if cv is not None:
        assessment = cv.assessment(section.id) if hasattr(cv, "assessment") else None
        if assessment is not None:
            out += [
                "# What this section is doing",
                "",
                f"Relevance to this job: {assessment.relevance}. {assessment.verdict}",
                "",
            ]
            if assessment.weakest_node_ids:
                out += [
                    "Lines judged to be pulling their weight least — worth your "
                    "attention first, though only change them if you can make them "
                    "genuinely better:",
                    ", ".join(assessment.weakest_node_ids),
                    "",
                ]

    # The requirements this CV already answers are the ones worth making
    # unmissable. The ones it does not answer are deliberately NOT listed: naming
    # them here invites the model to close the gap, which is the exact failure
    # the validator exists to catch, and a suggestion generated to be rejected is
    # latency and money spent on nothing.
    if gaps is not None and getattr(gaps, "covered", None):
        answered = [gap.requirement for gap in gaps.covered][:8]
        if answered:
            out += ["# Requirements this person genuinely meets", ""]
            out += [f"- {item}" for item in answered]
            out.append("")

    return out


def _job_summary(job: JobPost) -> str:
    bits: list[str] = []
    header = " · ".join(part for part in (job.role, job.company, job.location) if part)
    if header:
        bits.append(header)
    if job.seniority:
        bits.append(f"Seniority: {job.seniority}")

    essential = [r for r in job.requirements if r.essential]
    optional = [r for r in job.requirements if not r.essential]
    if essential:
        bits.append("\n## Essential requirements")
        bits.extend(f"- {r.text}" for r in essential)
    if optional:
        bits.append("\n## Nice to have")
        bits.extend(f"- {r.text}" for r in optional)
    if job.responsibilities:
        bits.append("\n## What they would do")
        bits.extend(f"- {r}" for r in job.responsibilities)
    if job.keywords:
        bits.append("\n## Terms that matter: " + ", ".join(job.keywords))
    return "\n".join(bits)


# ═══════════════════════════════════════════════════════════════════════════
# Job post parsing
# ═══════════════════════════════════════════════════════════════════════════

JOBPOST_SYSTEM = """\
You read a job advert and return its structure.

Report only what the post actually says. Do not infer a salary that is not \
printed, do not guess a company from a domain, do not invent requirements that \
"a role like this usually has". Where a field is absent, return null.

Separate essential requirements from nice-to-haves using the post's own framing \
("required", "must have", "essential" versus "bonus", "desirable", "nice to \
have"). When the post does not distinguish, treat the requirement as essential.

For keywords, list the specific terms a recruiter or an applicant tracking \
system would scan for — named technologies, methods, domains, qualifications. \
Rank the most important first. Exclude generic filler like "team player" or \
"communication skills"."""


def jobpost_user(text: str) -> str:
    return f"# Job post\n\n{_clip(text, 20000)}"


# ═══════════════════════════════════════════════════════════════════════════
# Keyword coverage
# ═══════════════════════════════════════════════════════════════════════════

COVERAGE_SYSTEM = """\
You decide, for each term the job post cares about, whether this CV already \
demonstrates it.

Judge meaning, not string matching. "K8s" covers "Kubernetes". "Led a team of \
six" covers "people management". "Built the settlement pipeline" covers \
"payments experience". A term listed in a skills line counts, but real evidence \
in the experience section is stronger — prefer to cite that.

Mark a term covered only when the CV genuinely supports it. Being generous here \
would tell the person they are ready when they are not, which is the failure \
this product exists to prevent.

When a term is covered, cite the node id and quote the phrase that shows it."""


def coverage_user(*, document: CVDocument, keywords: list[str]) -> str:
    lines = ["# The CV", ""]
    for node in document.nodes:
        if node.role in {"section_title", "contact"}:
            continue
        lines.append(f"[{node.id}] {node.text}")

    lines += ["", "# Terms to check", ""]
    lines.extend(f"- {keyword}" for keyword in keywords)
    lines.append("")
    lines.append("Return one entry per term, in the order given.")
    return "\n".join(lines)


def _clip(text: str, limit: int) -> str:
    """Trim runaway input. Job posts occasionally carry an entire careers page."""
    text = text.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n[… truncated, {len(text) - limit} characters omitted]"
