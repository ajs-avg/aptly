"""What the analysis pass produces.

The tailoring loop used to begin by asking a model to rewrite section one,
knowing nothing about sections two through nine. That is why it only ever
noticed small things: a pass that cannot see the document cannot have an opinion
about the document. It could tighten a sentence; it could not observe that the
most relevant job is third on the page, or that a whole section is dead weight
for this application.

These schemas are that missing opinion, made explicit and structured so the rest
of the pipeline can act on it deterministically.

Two rules hold throughout, and both are enforced by shape rather than by asking
politely:

**Nothing here invents content.** Every field is a judgement, an ordering or a
pointer at an existing node id. There is no field anywhere in this module that a
model could put a new bullet in — the redesign vocabulary in
:mod:`aptly.redesign.schemas` is likewise made only of permutations and hides.

**Every claim points at its evidence.** An assessment names node ids; a gap
names the line that covers it and quotes it. A judgement with nothing behind it
is not shown.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from aptly.analyse.percent import percent
from aptly.llm.schemas import JobPost

Relevance = Literal["critical", "useful", "neutral", "noise"]
GapStatus = Literal["covered", "partial", "missing"]


# ═══════════════════════════════════════════════════════════════════════════
# The job
# ═══════════════════════════════════════════════════════════════════════════


class JobAnalysis(BaseModel):
    """A job post read for what it is actually selecting on.

    ``post`` is the literal reading — the same structure the Library stores and
    freezes. Everything beside it is the interpretation, kept separate so the
    frozen snapshot never mixes what the advert said with what we inferred.
    """

    post: JobPost = Field(description="The job post read literally, in its own words.")

    optimises_for: str = Field(
        default="",
        description=(
            "One sentence: what the person reading applications is really selecting "
            "for. Not a summary of the advert — the thing that decides the shortlist."
        ),
    )
    evidence_wanted: list[str] = Field(
        default_factory=list,
        description=(
            "The kinds of proof this employer will look for, e.g. 'numbers showing "
            "scale', 'shipped production systems', 'worked with non-technical "
            "stakeholders'. Two to five items."
        ),
    )
    section_priority: list[str] = Field(
        default_factory=list,
        description=(
            "CV section kinds in the order this employer would want to read them, "
            "most important first. Use only: summary, experience, projects, skills, "
            "education, certifications, publications, awards, volunteering, "
            "languages, interests."
        ),
    )
    disqualifiers: list[str] = Field(
        default_factory=list,
        description=(
            "Things stated in the post that would rule an application out — a hard "
            "requirement for a licence, a location, a work permit. Only if stated."
        ),
    )


# ═══════════════════════════════════════════════════════════════════════════
# The CV
# ═══════════════════════════════════════════════════════════════════════════


class SectionAssessment(BaseModel):
    """How one section of the CV serves this particular application."""

    section_id: str = Field(description="The id of the section being assessed.")
    relevance: Relevance = Field(
        description=(
            "critical: the employer decides on this. useful: supports the case. "
            "neutral: harmless but not helping. noise: taking up space that a "
            "critical section needs."
        )
    )
    verdict: str = Field(description="One plain sentence on how this section reads for this job.")
    strongest_node_ids: list[str] = Field(
        default_factory=list,
        description="Ids of the lines in this section that make the strongest case. Up to three.",
    )
    weakest_node_ids: list[str] = Field(
        default_factory=list,
        description=(
            "Ids of lines that are generic, duplicated, or irrelevant to this job. "
            "Naming one here is not a decision to remove it."
        ),
    )


class RequirementEvidence(BaseModel):
    """The model's answer to "does this CV show this?", with its receipt.

    Only capability requirements are asked about — "three years in the role",
    "troubleshoots production issues alone". Named technologies are settled by
    looking them up, because that is a fact rather than a judgement.

    Measured against a labelled set, per-line cosine similarity separated these
    at about 82%, with genuine matches (0.185) scoring below false ones (0.222).
    A model that has the whole document in front of it does far better, and this
    costs no extra call: the same pass that reads the CV answers these too.

    ``node_id`` and ``quote`` are required when ``covered`` is true, and both are
    checked against the document afterwards. An answer that cannot point at a
    line is not evidence, it is an opinion, and it is discarded.
    """

    requirement: str = Field(description="The requirement, copied exactly as given to you.")
    covered: bool = Field(
        description=(
            "True only if a specific line of this CV genuinely demonstrates this. "
            "Wanting to be encouraging is not a reason to say true."
        )
    )
    node_id: str | None = Field(
        default=None,
        description="The id of the line that demonstrates it. Required when covered is true.",
    )
    quote: str | None = Field(
        default=None,
        description=(
            "The exact words from that line which demonstrate it, copied character "
            "for character. Required when covered is true."
        ),
    )


class CVAnalysis(BaseModel):
    """The whole CV, read once, against this job."""

    positioning: str = Field(
        default="",
        description=(
            "One or two sentences: what this CV currently positions the person as, "
            "read cold by a recruiter for THIS role. Be direct rather than kind."
        ),
    )
    strengths: list[str] = Field(
        default_factory=list,
        description="What genuinely works for this application. Two to four items.",
    )
    buried: list[str] = Field(
        default_factory=list,
        description=(
            "Evidence the person already has that a reader will miss because of "
            "where it sits or how it is worded. This is the highest-value finding "
            "the analysis can make."
        ),
    )
    sections: list[SectionAssessment] = Field(
        default_factory=list,
        description="One assessment per section you were given. Do not skip any.",
    )
    evidence: list[RequirementEvidence] = Field(
        default_factory=list,
        description=(
            "One entry for every requirement listed under 'Requirements to judge'. "
            "Answer all of them, in the order given."
        ),
    )

    def assessment(self, section_id: str) -> SectionAssessment | None:
        return next((s for s in self.sections if s.section_id == section_id), None)


# ═══════════════════════════════════════════════════════════════════════════
# The gap between them
# ═══════════════════════════════════════════════════════════════════════════


class Gap(BaseModel):
    """One thing the job asked for, and the best answer the CV has to it.

    Computed rather than generated. The status comes from a literal check and a
    cosine similarity, both of which are reproducible and neither of which can
    talk itself into believing the CV says something it does not.
    """

    requirement: str
    essential: bool = True
    status: GapStatus = "missing"
    evidence_node_id: str | None = None
    evidence_quote: str | None = None
    #: Cosine similarity to the closest line in the CV. 0.0 when nothing was
    #: comparable — an empty CV, or embeddings being unavailable.
    similarity: float = 0.0
    #: True when the match was a literal one. Literal matches are certain;
    #: semantic ones are an inference, and the UI is allowed to say so.
    literal: bool = False


#: What a requirement is worth, by whether the post treats it as a condition.
#: Three to one: enough that meeting every stated requirement carries the score,
#: not so much that the wishes stop counting at all.
WEIGHT = {True: 1.0, False: 0.34}

#: What each verdict earns. Partial is half — thin evidence is worth less than
#: unmistakable evidence, and rounding it up would be flattery.
CREDIT = {"covered": 1.0, "partial": 0.5, "missing": 0.0}


class GapMap(BaseModel):
    """Every requirement, scored."""

    gaps: list[Gap] = Field(default_factory=list)
    #: False when embeddings could not be computed and this is a literal-only
    #: reading. Surfaced rather than hidden: it changes how much the score means.
    semantic: bool = True

    @property
    def covered(self) -> list[Gap]:
        return [g for g in self.gaps if g.status == "covered"]

    @property
    def partial(self) -> list[Gap]:
        return [g for g in self.gaps if g.status == "partial"]

    @property
    def missing(self) -> list[Gap]:
        return [g for g in self.gaps if g.status == "missing"]

    @property
    def score(self) -> int:
        """How well this CV answers the post, weighted by what the post requires.

        Not a plain count. A job post states a handful of conditions and then
        lists a dozen things it would like, and counting them equally is how a
        CV that meets every stated requirement and half the wishes scores in the
        fifties — which is not what any recruiter reading it would say.

        So a must-have is worth roughly three nice-to-haves. Partial credit is
        half, as before: evidence that is present but thin is genuinely worth
        less than evidence that is unmistakable, and rounding it up would be the
        product flattering itself.
        """
        if not self.gaps:
            return 0

        earned = sum(WEIGHT[gap.essential] * CREDIT[gap.status] for gap in self.gaps)
        return percent(earned, sum(WEIGHT[gap.essential] for gap in self.gaps))

    @property
    def essential_met(self) -> tuple[int, int]:
        """Must-haves answered, out of must-haves asked for.

        The number a person actually needs. A high percentage held up by
        nice-to-haves while an essential requirement is missing is the shape of
        application that gets rejected in six seconds, and the breakdown is what
        makes that visible.
        """
        essential = [gap for gap in self.gaps if gap.essential]
        return sum(1 for gap in essential if gap.status == "covered"), len(essential)


# ═══════════════════════════════════════════════════════════════════════════
# Everything together
# ═══════════════════════════════════════════════════════════════════════════


Fit = Literal["strong", "workable", "weak", "mismatch"]


class Analysis(BaseModel):
    """The complete reading, handed to whichever mode the user chose."""

    job: JobAnalysis
    cv: CVAnalysis
    gaps: GapMap

    def relevance_of(self, section_id: str) -> Relevance:
        found = self.cv.assessment(section_id)
        return found.relevance if found else "neutral"

    @property
    def fit(self) -> Fit:
        """How close this CV is to this job, before anything is changed.

        This exists because "no suggestions" has two opposite meanings and the
        UI was showing both the same way. A pastry chef's CV against a data
        engineering post produces zero suggestions — correctly, because there is
        nothing true to surface — and the screen read that as *nothing to
        improve, you are ready to send*. The most misleading thing the product
        could tell someone.

        Decided from the gap map rather than from a model's opinion, so it is
        reproducible and cannot be talked into optimism.
        """
        essential = [gap for gap in self.gaps.gaps if gap.essential]
        answered = [gap for gap in essential if gap.status == "covered"]
        score = self.gaps.score

        if essential and not answered and score < 20:
            return "mismatch"
        if score < 40:
            return "weak"
        if score < 70:
            return "workable"
        return "strong"


__all__ = [
    "Analysis",
    "CVAnalysis",
    "Gap",
    "GapMap",
    "GapStatus",
    "JobAnalysis",
    "Relevance",
    "SectionAssessment",
]
