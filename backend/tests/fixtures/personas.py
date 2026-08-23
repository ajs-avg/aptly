"""Fixture CVs, defined once and rendered into every format.

Keeping the content in one place means a round-trip test can assert that the
same person parsed from .docx, .pdf, .tex and .txt yields the same sections and
the same bullets — which is the whole promise of the canonical model.

The people are invented. The *shapes* are not: each persona reproduces a layout
that actually breaks CV parsers in the wild.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Job:
    role: str
    org: str
    location: str
    dates: str
    bullets: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Study:
    qualification: str
    institution: str
    dates: str
    detail: str = ""


@dataclass(frozen=True, slots=True)
class Persona:
    key: str
    name: str
    headline: str
    email: str
    phone: str
    location: str
    links: tuple[str, ...]
    summary: str
    experience: tuple[Job, ...]
    education: tuple[Study, ...]
    skills: tuple[str, ...]
    #: What this fixture is meant to stress in the parsers.
    stresses: str = ""
    projects: tuple[tuple[str, str], ...] = field(default_factory=tuple)


PRIYA = Persona(
    key="priya_sharma_pm",
    name="Priya Sharma",
    headline="Senior Product Manager",
    email="priya.sharma@example.com",
    phone="+44 7700 900142",
    location="London, United Kingdom",
    links=("linkedin.com/in/priyasharma-pm", "github.com/priyasharma"),
    summary=(
        "Product manager with eight years building hardware-and-software products, "
        "most recently leading a robotics launch from prototype to general availability. "
        "I work close to engineering and I measure what I ship."
    ),
    experience=(
        Job(
            role="Senior Product Manager",
            org="Northwind Robotics",
            location="London",
            dates="Mar 2022 – Present",
            bullets=(
                "Led the end-to-end launch of a warehouse picking robot across 4 markets, "
                "taking it from prototype to general availability in 14 months.",
                "Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding "
                "flow with the field operations team.",
                "Ran the discovery that killed a planned feature after 9 customer "
                "interviews, saving roughly two quarters of engineering time.",
                "Grew monthly active installations from 40 to 310 while holding support "
                "tickets flat.",
            ),
        ),
        Job(
            role="Product Manager",
            org="Halcyon Systems",
            location="Manchester",
            dates="Jun 2019 – Feb 2022",
            bullets=(
                "Owned the scheduling module used by 1,200 daily users across 18 warehouse sites.",
                "Shipped a rewrite of the shift planner that reduced planning errors "
                "by 34% in the first quarter after release.",
                "Introduced a weekly triage with support and engineering that brought "
                "median bug age down from 21 days to 5.",
            ),
        ),
        Job(
            role="Associate Product Manager",
            org="Kestrel Analytics",
            location="Manchester",
            dates="Aug 2017 – May 2019",
            bullets=(
                "Wrote the specification for a self-serve reporting tool adopted by "
                "60% of accounts within six months.",
                "Partnered with two engineers to instrument the product, creating the "
                "first reliable funnel the company had.",
            ),
        ),
    ),
    education=(
        Study(
            qualification="MSc Human-Computer Interaction",
            institution="University of Manchester",
            dates="2016 – 2017",
            detail="Distinction. Thesis on operator trust in semi-autonomous systems.",
        ),
        Study(
            qualification="BSc Computer Science",
            institution="University of Leeds",
            dates="2013 – 2016",
            detail="First class honours.",
        ),
    ),
    skills=(
        "Product discovery",
        "Roadmapping",
        "SQL",
        "Figma",
        "A/B testing",
        "Jira",
        "Stakeholder management",
        "Technical writing",
    ),
    stresses="Classic single-column Word CV with real Word list styles.",
)


DANIEL = Persona(
    key="daniel_okonkwo_swe",
    name="Daniel Okonkwo",
    headline="Backend Software Engineer",
    email="d.okonkwo@example.com",
    phone="+353 83 555 0119",
    location="Dublin, Ireland",
    links=("github.com/dokonkwo", "danielokonkwo.dev"),
    summary=(
        "Backend engineer focused on payments and reliability. Six years in Python "
        "and Go, most of it on systems that cannot afford to be wrong."
    ),
    experience=(
        Job(
            role="Senior Backend Engineer",
            org="Ardan Pay",
            location="Dublin",
            dates="Jan 2023 – Present",
            bullets=(
                "Rebuilt the settlement pipeline in Go, cutting end-of-day processing "
                "from 50 minutes to 7.",
                "Introduced idempotency keys across the payments API, eliminating a "
                "class of duplicate-charge incidents that had caused 3 outages.",
                "Led the migration of 40 services from a shared Postgres to per-service "
                "schemas with zero downtime.",
            ),
        ),
        Job(
            role="Backend Engineer",
            org="Mistral Freight",
            location="Cork",
            dates="Sep 2020 – Dec 2022",
            bullets=(
                "Built the rate-quoting service handling 2.4 million requests a day at "
                "a p99 of 80ms.",
                "Cut cloud spend by 28% by right-sizing workloads and removing an "
                "over-provisioned cache tier.",
                "Mentored two junior engineers through their first on-call rotations.",
            ),
        ),
    ),
    education=(
        Study(
            qualification="BEng Software Engineering",
            institution="University College Cork",
            dates="2016 – 2020",
            detail="First class honours.",
        ),
    ),
    skills=(
        "Python",
        "Go",
        "PostgreSQL",
        "Kafka",
        "Kubernetes",
        "Terraform",
        "gRPC",
        "Observability",
    ),
    stresses="Two-column layout built with a Word table — the case that breaks naive parsers.",
)


MEI = Persona(
    key="mei_chen_data",
    name="Mei Chen",
    headline="Data Scientist",
    email="mei.chen@example.com",
    phone="+1 415 555 0186",
    location="San Francisco, CA",
    links=("linkedin.com/in/meichen-ds",),
    summary=(
        "Data scientist working on forecasting and experimentation. I care about "
        "models that survive contact with production."
    ),
    experience=(
        Job(
            role="Senior Data Scientist",
            org="Lumen Grid",
            location="San Francisco",
            dates="Apr 2021 – Present",
            bullets=(
                "Built the demand forecasting model now used for 92% of grid capacity "
                "planning, improving mean absolute error by 19% over the prior baseline.",
                "Designed the experimentation framework that standardised 60+ A/B tests "
                "a year across four product teams.",
                "Shipped an anomaly detector that catches meter faults a median of 6 "
                "days earlier than the previous rules engine.",
            ),
        ),
        Job(
            role="Data Scientist",
            org="Beacon Retail Group",
            location="Seattle",
            dates="Jul 2018 – Mar 2021",
            bullets=(
                "Developed a markdown optimisation model that lifted end-of-season "
                "margin by 4.2 percentage points across 380 stores.",
                "Replaced a spreadsheet forecasting process with a Python pipeline, "
                "cutting the monthly planning cycle from 5 days to 1.",
            ),
        ),
    ),
    education=(
        Study(
            qualification="MS Statistics",
            institution="University of Washington",
            dates="2016 – 2018",
        ),
        Study(
            qualification="BS Mathematics",
            institution="UC San Diego",
            dates="2012 – 2016",
        ),
    ),
    skills=(
        "Python",
        "R",
        "SQL",
        "PyTorch",
        "dbt",
        "Airflow",
        "Causal inference",
        "Bayesian methods",
    ),
    stresses="Single-column PDF with mixed fonts, sizes and an accent colour on headings.",
)


SOFIA = Persona(
    key="sofia_ramos_design",
    name="Sofia Ramos",
    headline="Product Designer",
    email="sofia@example.com",
    phone="+34 600 555 019",
    location="Barcelona, Spain",
    links=("sofiaramos.design", "linkedin.com/in/sofiaramos"),
    summary=(
        "Product designer working end to end, from research through to shipped "
        "interface. Ten years across fintech and healthcare."
    ),
    experience=(
        Job(
            role="Lead Product Designer",
            org="Vera Health",
            location="Barcelona",
            dates="Feb 2021 – Present",
            bullets=(
                "Redesigned the patient intake flow, reducing drop-off from 41% to 23% "
                "over two releases.",
                "Built and maintained the design system now used by 6 product squads.",
                "Ran 40 usability sessions with clinicians, turning findings into a "
                "prioritised backlog the team actually shipped.",
            ),
        ),
        Job(
            role="Product Designer",
            org="Tessera Bank",
            location="Madrid",
            dates="Mar 2017 – Jan 2021",
            bullets=(
                "Designed the mobile onboarding that took account setup from 11 minutes "
                "to under 4.",
                "Introduced accessibility standards that brought the app to WCAG AA "
                "across all primary flows.",
            ),
        ),
    ),
    education=(
        Study(
            qualification="BA Graphic Design",
            institution="Elisava Barcelona",
            dates="2011 – 2015",
        ),
    ),
    skills=("Figma", "Design systems", "User research", "Prototyping", "Accessibility", "HTML/CSS"),
    stresses="Two-column PDF — sidebar plus main column, the hardest reading-order case.",
)


ARJUN = Persona(
    key="arjun_patel_ml",
    name="Arjun Patel",
    headline="Machine Learning Engineer",
    email="arjun.patel@example.com",
    phone="+91 98200 55510",
    location="Bengaluru, India",
    links=("github.com/arjunpatel-ml", "arjunpatel.io"),
    summary=(
        "ML engineer building retrieval and ranking systems. I like problems where "
        "latency and quality are both non-negotiable."
    ),
    experience=(
        Job(
            role="Machine Learning Engineer",
            org="Cordant AI",
            location="Bengaluru",
            dates="Jun 2022 – Present",
            bullets=(
                "Built the retrieval layer serving 18 million queries a day at a p95 of 40ms.",
                "Improved top-3 relevance by 11% by replacing lexical search with a "
                "hybrid dense-sparse retriever.",
                "Cut inference cost per query by 62% through distillation and batching.",
            ),
        ),
        Job(
            role="Data Engineer",
            org="Vayu Logistics",
            location="Pune",
            dates="Jul 2019 – May 2022",
            bullets=(
                "Built the feature store backing 14 production models.",
                "Reduced pipeline failures by 70% by moving from cron to a "
                "dependency-aware scheduler.",
            ),
        ),
    ),
    education=(
        Study(
            qualification="B.Tech Computer Science",
            institution="IIT Bombay",
            dates="2015 – 2019",
        ),
    ),
    skills=("Python", "PyTorch", "FAISS", "Ray", "Kubernetes", "Spark", "MLflow"),
    projects=(
        (
            "Open-source vector index benchmark",
            "Benchmarked 6 ANN libraries on recall and latency; 900 GitHub stars.",
        ),
    ),
    stresses="LaTeX source with sections, itemize blocks, textbf and escaped characters.",
)


ELENA = Persona(
    key="elena_volkov_marketing",
    name="Elena Volkov",
    headline="Growth Marketing Manager",
    email="elena.volkov@example.com",
    phone="+49 151 555 0173",
    location="Berlin, Germany",
    links=("linkedin.com/in/elenavolkov",),
    summary=(
        "Growth marketer with a bias for measurable channels. Seven years across "
        "B2B SaaS, mostly owning the top of the funnel."
    ),
    experience=(
        Job(
            role="Growth Marketing Manager",
            org="Ostara Software",
            location="Berlin",
            dates="Sep 2021 – Present",
            bullets=(
                "Grew organic signups from 900 to 4,100 per month over 18 months "
                "through a programmatic SEO build-out.",
                "Cut blended customer acquisition cost by 31% by reallocating spend "
                "away from two underperforming paid channels.",
                "Launched a lifecycle email programme that added 12% to trial-to-paid conversion.",
            ),
        ),
        Job(
            role="Marketing Specialist",
            org="Nordlicht Media",
            location="Hamburg",
            dates="Jan 2018 – Aug 2021",
            bullets=(
                "Ran paid social across 5 markets with a monthly budget of 85,000 EUR.",
                "Built the reporting stack that gave the team its first per-channel attribution.",
            ),
        ),
    ),
    education=(
        Study(
            qualification="MA Media Management",
            institution="Humboldt University Berlin",
            dates="2016 – 2018",
        ),
    ),
    skills=("SEO", "Paid social", "HubSpot", "Google Analytics", "SQL", "Copywriting", "Webflow"),
    stresses="Plain text with ALL-CAPS headings and hyphen bullets — no styling signals at all.",
)


ALL_PERSONAS: tuple[Persona, ...] = (PRIYA, DANIEL, MEI, SOFIA, ARJUN, ELENA)

#: Which format each persona is rendered into by ``generate.py``.
FORMAT_BY_PERSONA: dict[str, str] = {
    "priya_sharma_pm": "docx",
    "daniel_okonkwo_swe": "docx",
    "mei_chen_data": "pdf",
    "sofia_ramos_design": "pdf",
    "arjun_patel_ml": "tex",
    "elena_volkov_marketing": "txt",
}


def by_key(key: str) -> Persona:
    for persona in ALL_PERSONAS:
        if persona.key == key:
            return persona
    raise KeyError(key)
