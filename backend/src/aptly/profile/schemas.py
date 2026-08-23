"""The career profile: everything the person can tell us about themselves.

This is the piece that makes the second, freely-rebuilt CV honest.

The no-fabrication rule has always been enforced by checking every claim against
*what the person wrote*. Until now that was only their uploaded CV, which is a
one-page summary written for some other job — so a rebuild could reorder and
retighten it and little else. There simply was not enough true material to build
a fuller document from.

The profile changes what "the person's own material" means. Everything here is
the user's own assertion about their own history, entered by them, and it has
exactly the same standing as a line of their CV: it is a source, it is quotable,
and a rewrite may draw on it. Nothing here is inferred, generated or enriched.

So the rule does not loosen — the evidence base widens. A CV rebuilt from a full
profile can be genuinely detailed and still contain not one sentence the person
did not supply. A rebuild from an empty profile stays thin, and it should: the
alternative would be inventing the difference.

Every field is optional. Someone with ten minutes fills in five things and gets
a better result than they would have; nobody is blocked at a wall of inputs.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Proficiency = Literal["learning", "working", "strong", "expert"]
WorkStyle = Literal["onsite", "hybrid", "remote", "no_preference"]


# ═══════════════════════════════════════════════════════════════════════════
# Who they are
# ═══════════════════════════════════════════════════════════════════════════


class Identity(BaseModel):
    """Contact details and the one-line claim at the top of a CV."""

    full_name: str = ""
    headline: str = Field(
        default="",
        description="How they describe themselves, e.g. 'Frontend developer'.",
    )
    email: str = ""
    phone: str = ""
    location: str = ""
    #: Kept separate from location because a post that says "Bengaluru only"
    #: turns on this, and it is the sort of thing people forget to mention.
    open_to_relocation: bool = False
    work_authorisation: str = Field(
        default="", description="e.g. 'Indian citizen', 'UK work visa until 2028'."
    )
    links: list[str] = Field(default_factory=list, description="LinkedIn, GitHub, portfolio.")
    summary: str = Field(
        default="",
        description="A paragraph in their own words. Used as source material, never verbatim.",
    )


# ═══════════════════════════════════════════════════════════════════════════
# What they have done
# ═══════════════════════════════════════════════════════════════════════════


class Achievement(BaseModel):
    """One concrete thing done, with whatever evidence they can attach.

    ``metric`` is separate from ``text`` on purpose. Numbers are the single most
    valuable thing on a CV and the single most dangerous thing to generate, so
    asking for them here — where the person types them themselves — is how a
    rebuild gets to use figures at all.
    """

    text: str
    metric: str = Field(
        default="", description="The number, if there is one: '2.4M rows', '35 minutes', '30%'."
    )
    skills_used: list[str] = Field(default_factory=list)


class Role(BaseModel):
    """One job."""

    title: str = ""
    company: str = ""
    location: str = ""
    start: str = Field(default="", description="Free text: 'March 2023', '2019-06'.")
    end: str = Field(default="", description="Empty means current.")
    is_current: bool = False
    employment_type: str = Field(default="", description="Full-time, contract, internship.")
    team_size: str = ""
    reported_to: str = ""
    what_you_did: str = Field(default="", description="A paragraph in their own words.")
    achievements: list[Achievement] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    reason_for_leaving: str = ""


class Education(BaseModel):
    degree: str = ""
    field_of_study: str = ""
    institution: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    grade: str = Field(default="", description="CGPA, classification, percentage.")
    highlights: list[str] = Field(
        default_factory=list, description="Thesis, relevant coursework, societies."
    )


class Project(BaseModel):
    name: str = ""
    description: str = ""
    role: str = Field(default="", description="What they personally did on it.")
    technologies: list[str] = Field(default_factory=list)
    link: str = ""
    outcome: str = Field(default="", description="What it achieved, with numbers if any.")
    is_professional: bool = Field(
        default=False, description="True if done at work rather than personally."
    )


class Skill(BaseModel):
    """One skill, with the person's own honest read on how well they know it.

    Self-rated deliberately. The alternative is inferring proficiency from how
    often a word appears, which is how a CV ends up claiming expertise in a tool
    someone used once.
    """

    name: str
    category: str = Field(default="", description="Language, framework, tool, domain, soft.")
    proficiency: Proficiency = "working"
    years: str = ""
    last_used: str = ""


class Certification(BaseModel):
    name: str = ""
    issuer: str = ""
    issued: str = ""
    expires: str = ""
    credential_id: str = ""


class Language(BaseModel):
    name: str = ""
    level: str = Field(default="", description="Native, fluent, professional, conversational.")


class Publication(BaseModel):
    title: str = ""
    venue: str = ""
    date: str = ""
    link: str = ""
    description: str = ""


class Award(BaseModel):
    name: str = ""
    issuer: str = ""
    date: str = ""
    description: str = ""


class Volunteering(BaseModel):
    organisation: str = ""
    role: str = ""
    start: str = ""
    end: str = ""
    description: str = ""


# ═══════════════════════════════════════════════════════════════════════════
# What they want
# ═══════════════════════════════════════════════════════════════════════════


class Preferences(BaseModel):
    """What they are looking for. Shapes the tailoring, never appears as a claim."""

    target_roles: list[str] = Field(default_factory=list)
    target_industries: list[str] = Field(default_factory=list)
    seniority: str = ""
    work_style: WorkStyle = "no_preference"
    locations: list[str] = Field(default_factory=list)
    notice_period: str = ""
    salary_expectation: str = ""
    #: Things they do not want to be put forward for. Respected by the rebuild.
    avoid: list[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# All of it
# ═══════════════════════════════════════════════════════════════════════════


class CareerProfile(BaseModel):
    """Everything the person has told us about their own career."""

    identity: Identity = Field(default_factory=Identity)
    roles: list[Role] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)
    languages: list[Language] = Field(default_factory=list)
    publications: list[Publication] = Field(default_factory=list)
    awards: list[Award] = Field(default_factory=list)
    volunteering: list[Volunteering] = Field(default_factory=list)
    preferences: Preferences = Field(default_factory=Preferences)
    #: Anything that did not fit a field. Still source material.
    notes: str = ""

    # ── Completeness ─────────────────────────────────────────────────────

    @property
    def is_empty(self) -> bool:
        return not (self.roles or self.projects or self.skills or self.education)

    @property
    def completeness(self) -> int:
        """A rough percentage, shown to the person as encouragement.

        Weighted by what actually improves a rebuilt CV rather than by field
        count: achievements with numbers in them are worth far more than a
        filled-in phone number, and the score should say so.
        """
        earned = 0.0
        for weight, has in (
            (10, bool(self.identity.full_name and self.identity.email)),
            (8, bool(self.identity.headline)),
            (10, bool(self.identity.summary)),
            (18, bool(self.roles)),
            (16, any(role.achievements for role in self.roles)),
            (10, any(a.metric for role in self.roles for a in role.achievements)),
            (10, len(self.skills) >= 5),
            (8, bool(self.education)),
            (6, bool(self.projects)),
            (4, bool(self.preferences.target_roles)),
        ):
            if has:
                earned += weight
        return round(earned)

    def missing_for_a_strong_rebuild(self) -> list[str]:
        """What to ask for next, in the order that most improves the result."""
        gaps: list[str] = []
        if not self.roles:
            gaps.append(
                "Your work history — even one role gives the rebuild something to stand on."
            )
        elif not any(role.achievements for role in self.roles):
            gaps.append(
                "What you actually achieved in each role, not just what you were there to do."
            )
        elif not any(a.metric for role in self.roles for a in role.achievements):
            gaps.append(
                "Numbers on your achievements. A figure you type here is one a rebuilt CV can "
                "use; one you do not, it can never invent."
            )
        if len(self.skills) < 5:
            gaps.append("Your skills, with an honest level for each.")
        if not self.identity.summary:
            gaps.append("A paragraph about yourself in your own words.")
        if not self.education:
            gaps.append("Your education.")
        return gaps

    # ── As source material ───────────────────────────────────────────────

    def as_source_text(self) -> str:
        """The whole profile as prose, for the no-fabrication checker to pool.

        Flattened rather than structured because that is what the validator
        consumes: it asks "did this person ever write this word", and the answer
        has to include everything they told us here.
        """
        parts: list[str] = []
        identity = self.identity
        parts.append(
            " ".join(
                filter(
                    None,
                    [
                        identity.full_name,
                        identity.headline,
                        identity.location,
                        identity.work_authorisation,
                        identity.summary,
                    ],
                )
            )
        )

        for role in self.roles:
            parts.append(
                " ".join(
                    filter(
                        None,
                        [
                            role.title,
                            role.company,
                            role.location,
                            role.employment_type,
                            role.team_size,
                            role.what_you_did,
                            " ".join(role.technologies),
                        ],
                    )
                )
            )
            for achievement in role.achievements:
                parts.append(
                    " ".join(
                        filter(
                            None,
                            [
                                achievement.text,
                                achievement.metric,
                                " ".join(achievement.skills_used),
                            ],
                        )
                    )
                )

        for education in self.education:
            parts.append(
                " ".join(
                    filter(
                        None,
                        [
                            education.degree,
                            education.field_of_study,
                            education.institution,
                            education.grade,
                            " ".join(education.highlights),
                        ],
                    )
                )
            )

        for project in self.projects:
            parts.append(
                " ".join(
                    filter(
                        None,
                        [
                            project.name,
                            project.description,
                            project.role,
                            project.outcome,
                            " ".join(project.technologies),
                        ],
                    )
                )
            )

        parts.extend(f"{skill.name} {skill.category} {skill.years}" for skill in self.skills)
        parts.extend(f"{c.name} {c.issuer}" for c in self.certifications)
        parts.extend(f"{lang.name} {lang.level}" for lang in self.languages)
        parts.extend(f"{p.title} {p.venue} {p.description}" for p in self.publications)
        parts.extend(f"{a.name} {a.issuer} {a.description}" for a in self.awards)
        parts.extend(f"{v.organisation} {v.role} {v.description}" for v in self.volunteering)
        if self.notes:
            parts.append(self.notes)

        return "\n".join(part.strip() for part in parts if part.strip())


__all__ = [
    "Achievement",
    "Award",
    "CareerProfile",
    "Certification",
    "Education",
    "Identity",
    "Language",
    "Preferences",
    "Project",
    "Publication",
    "Role",
    "Skill",
    "Volunteering",
]
