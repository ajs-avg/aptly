"""The freely-rebuilt CV, and what it is not allowed to say.

The rebuild composes whole sentences rather than editing existing ones, which
gives it more room to invent than the tailoring path has, not less. These cover
the check that closes that gap — and the two ways it has been wrong: too strict,
throwing away true lines, and the shape of the failure that would matter most,
letting an invented one through.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.profile.schemas import Achievement, CareerProfile, Identity, Role, Skill
from aptly.rebuild import _check, to_document
from aptly.rebuild.schemas import (
    RebuildResult,
    RebuiltCV,
    RebuiltEntry,
    RebuiltLine,
    RebuiltSection,
)
from aptly.validate import SourceMaterial

#: The claim checks fire in order — figure, then name, then technology — so a
#: capitalised tool is reported as a name. Tests assert the line was refused,
#: not which check refused it.
_INVENTED = {"invented_figure", "invented_name", "invented_technology"}

CV = """\
Rahul Menon
rahul.menon@example.com | Bengaluru

WORK EXPERIENCE
Frontend Developer, Kalyra Commerce — 2022 to present
- Built the internal pricing dashboard used by the merchandising team.
"""

PROFILE = CareerProfile(
    identity=Identity(
        full_name="Rahul Menon",
        headline="Frontend developer",
        summary="Three years building customer-facing web apps.",
    ),
    roles=[
        Role(
            title="Frontend Developer",
            company="Kalyra Commerce",
            technologies=["React", "PostgreSQL", "Python"],
            achievements=[
                Achievement(
                    text="Wrote the nightly reconciliation job for the product feed",
                    metric="1.2 million rows a night",
                )
            ],
        )
    ],
    skills=[Skill(name="SQL"), Skill(name="Python"), Skill(name="React")],
)


@pytest.fixture
def source() -> SourceMaterial:
    return SourceMaterial.build(parse_pasted(CV), profile_text=PROFILE.as_source_text())


def _built(*lines: RebuiltLine, headline: str = "") -> RebuiltCV:
    return RebuiltCV(
        headline=headline,
        sections=[RebuiltSection(kind="experience", title="EXPERIENCE", lines=list(lines))],
    )


def _kept(result: RebuildResult) -> list[str]:
    return [line.text for section in result.sections for line in section.lines]


# ═══════════════════════════════════════════════════════════════════════════
# What survives
# ═══════════════════════════════════════════════════════════════════════════


def test_a_line_grounded_in_the_profile_survives(source: SourceMaterial) -> None:
    result = _check(
        _built(
            RebuiltLine(
                text="Wrote the nightly reconciliation job that checks the product feed.",
                drawn_from="Wrote the nightly reconciliation job for the product feed",
            )
        ),
        source,
    )

    assert len(_kept(result)) == 1
    assert result.dropped == []


def test_a_paraphrased_citation_survives(source: SourceMaterial) -> None:
    """The regression that made the rebuilt CV score *worse* than the original.

    Models rewrite their own citation — they merge clauses and change the
    opening words. Matching that positionally read a true line as a fabricated
    one: a summary citing "Three years building customer-facing web apps",
    present in the profile word for word, was thrown away because the citation
    began "Frontend developer with three years…". Six lines went in one run, the
    skills line among them.
    """
    result = _check(
        _built(
            RebuiltLine(
                text="Frontend developer with three years building customer-facing web apps.",
                drawn_from="Frontend developer with three years building customer-facing web applications",
            )
        ),
        source,
    )

    assert _kept(result), f"a true line was dropped: {result.dropped}"


def test_the_persons_own_figure_may_be_used(source: SourceMaterial) -> None:
    """Numbers typed into the profile are exactly what a rebuild exists to use."""
    result = _check(
        _built(
            RebuiltLine(
                text="Reconciled 1.2 million rows a night against the catalogue.",
                drawn_from="Wrote the nightly reconciliation job for the product feed",
            )
        ),
        source,
    )

    assert _kept(result) == ["Reconciled 1.2 million rows a night against the catalogue."]


# ═══════════════════════════════════════════════════════════════════════════
# What does not
# ═══════════════════════════════════════════════════════════════════════════


def test_an_invented_figure_is_dropped(source: SourceMaterial) -> None:
    result = _check(
        _built(
            RebuiltLine(
                text="Reconciled 40 million rows a night against the catalogue.",
                drawn_from="Wrote the nightly reconciliation job for the product feed",
            )
        ),
        source,
    )

    assert _kept(result) == []
    assert result.dropped[0].reason == "invented_figure"


def test_an_invented_technology_is_dropped(source: SourceMaterial) -> None:
    """The failure the product exists to prevent: the employer's wish list
    quietly becoming the applicant's history."""
    result = _check(
        _built(
            RebuiltLine(
                text="Built and scheduled the reconciliation job in Airflow.",
                drawn_from="Wrote the nightly reconciliation job for the product feed",
            )
        ),
        source,
    )

    # Named as a proper noun rather than a technology — it is capitalised, and
    # that check runs first. Which of the two catches it is an implementation
    # detail; that an unmentioned tool never reaches the page is not.
    assert _kept(result) == []
    assert result.dropped[0].reason in _INVENTED


def test_a_line_citing_nothing_real_is_dropped(source: SourceMaterial) -> None:
    result = _check(
        _built(
            RebuiltLine(
                text="Led the migration of the reporting stack.",
                drawn_from="Led a team of engineers through a multi-quarter platform migration",
            )
        ),
        source,
    )

    assert _kept(result) == []
    assert result.dropped[0].reason == "unquotable_source"


def test_an_uncited_line_is_dropped(source: SourceMaterial) -> None:
    """An empty citation is not a small omission — it is the whole guarantee."""
    result = _check(
        _built(RebuiltLine(text="Delivered exceptional results across the business.")),
        source,
    )

    assert _kept(result) == []


def test_an_invented_headline_is_removed_not_kept(source: SourceMaterial) -> None:
    """A headline is an identity claim, and the first thing a phone screen tests."""
    result = _check(_built(headline="Senior Kubernetes Platform Engineer"), source)

    assert result.headline == ""
    assert result.dropped[0].reason == "invented_headline"


def test_a_job_survives_losing_every_bullet(source: SourceMaterial) -> None:
    """Dropping a claim about a job must not delete the job.

    Removing the entry would erase employment history over a wording problem,
    and leave a gap in the timeline that the person then has to explain.
    """
    built = RebuiltCV(
        sections=[
            RebuiltSection(
                kind="experience",
                title="EXPERIENCE",
                entries=[
                    RebuiltEntry(
                        title="Frontend Developer",
                        organisation="Kalyra Commerce",
                        start="2022",
                        end="Present",
                        lines=[
                            RebuiltLine(
                                text="Ran the Kafka ingestion pipeline.",
                                drawn_from="Wrote the nightly reconciliation job for the product feed",
                            )
                        ],
                    )
                ],
            )
        ]
    )

    result = _check(built, source)
    entry = result.sections[0].entries[0]

    assert entry.organisation == "Kalyra Commerce"
    assert entry.lines == []
    assert result.dropped[0].reason in _INVENTED


# ═══════════════════════════════════════════════════════════════════════════
# Back into the canonical model
# ═══════════════════════════════════════════════════════════════════════════


def test_the_rebuild_becomes_a_real_document() -> None:
    """It has to go through the shared builder, or the preview, the validator
    and the exporter all stop working on it."""
    original = parse_pasted(CV)
    result = RebuildResult(
        headline="Frontend developer",
        sections=[
            RebuiltSection(
                kind="summary",
                title="SUMMARY",
                lines=[RebuiltLine(text="Three years building web apps.")],
            ),
            RebuiltSection(
                kind="skills",
                title="TECHNICAL SKILLS",
                lines=[
                    RebuiltLine(text="Languages: Python, SQL, TypeScript"),
                    RebuiltLine(text="Databases: PostgreSQL"),
                ],
            ),
            RebuiltSection(
                kind="experience",
                title="WORK EXPERIENCE",
                entries=[
                    RebuiltEntry(
                        title="Frontend Developer",
                        organisation="Kalyra Commerce",
                        start="2022",
                        end="Present",
                        lines=[RebuiltLine(text="Built the internal pricing dashboard.")],
                    )
                ],
            ),
        ],
    )

    document = to_document(result, original)
    kinds = [section.kind for section in document.sections]

    assert document.contact.name == "Rahul Menon"
    assert document.contact.email == "rahul.menon@example.com"
    assert "summary" in kinds
    assert "experience" in kinds

    # The labelled skills lines stay content. Read as headings, one of them
    # opened a Languages section and swallowed the rest of the CV.
    assert kinds.count("skills") == 1
    assert "languages" not in kinds

    skills = document.section("skills")
    assert skills is not None
    text = " ".join(node.text for node in skills.nodes)
    assert "Python" in text
    assert "PostgreSQL" in text


def test_the_rebuild_says_it_is_not_the_original_file() -> None:
    """It cannot be written back into the uploaded .docx, and the person is
    told that rather than finding out at download."""
    document = to_document(RebuildResult(sections=[]), parse_pasted(CV))

    assert document.warnings
    assert "rebuilt" in document.source_filename
