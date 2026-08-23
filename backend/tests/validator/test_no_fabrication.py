"""Adversarial tests for the no-fabrication validator.

This is the product's central claim — "Aptly never adds a skill or job you do not
have" — so these tests are written to *break* it rather than to confirm it works.
Each one is a plausible thing a language model actually does when asked to make a
CV sound better for a job.

A rejection here is the validator succeeding.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.llm.schemas import JobPost, Provenance, Requirement, Suggestion
from aptly.model.document import CVDocument, TextNode
from aptly.validate import SourceMaterial, validate

CV = """\
Daniel Reyes
daniel.reyes@example.com | +44 7700 900100 | Manchester

SUMMARY
Backend engineer with six years in Python, mostly on payment systems.

EXPERIENCE

Backend Engineer, Halcyon Pay — Mar 2021 – Present
- Rebuilt the settlement pipeline, cutting end-of-day processing from 50 minutes to 7.
- Introduced idempotency keys across the payments API, ending duplicate charges.
- Mentored two junior engineers through their first on-call rotations.

Junior Developer, Kestrel Systems — Jul 2019 – Feb 2021
- Built internal reporting tools used by 40 staff.
- Cut the nightly batch run by half.

EDUCATION
BSc Computer Science, University of Leeds — 2015 – 2019

SKILLS
Python, PostgreSQL, Redis, Docker, REST APIs
"""

JOB = JobPost(
    company="Northwind",
    role="Senior Backend Engineer",
    keywords=["Kubernetes", "Go", "payments", "Python", "microservices"],
    requirements=[
        Requirement(text="Strong Python", keywords=["Python"], essential=True),
        Requirement(text="Kubernetes in production", keywords=["Kubernetes"], essential=True),
    ],
)


@pytest.fixture
def document() -> CVDocument:
    return parse_pasted(CV)


@pytest.fixture
def source(document: CVDocument) -> SourceMaterial:
    return SourceMaterial.build(document)


def _bullet(document: CVDocument, contains: str) -> TextNode:
    return next(node for node in document.editable_nodes if contains in node.text)


def _suggest(node: TextNode, after: str, *, quote: str | None = None, **kwargs) -> Suggestion:
    return Suggestion(
        node_id=node.id,
        before=node.text,
        after=after,
        reason="Matches the post's emphasis on payments reliability.",
        provenance=Provenance(kind="cv_node", source_id=node.id, quote=quote or node.text),
        confidence=kwargs.pop("confidence", "high"),
        **kwargs,
    )


# ═══════════════════════════════════════════════════════════════════════════
# What must be allowed — a validator that rejects everything is useless
# ═══════════════════════════════════════════════════════════════════════════


def test_accepts_an_honest_rephrase(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(
            node,
            "Rebuilt the settlement pipeline, cutting end-of-day processing to 7 minutes from 50.",
        ),
        document=document,
        source=source,
        job=JOB,
    )
    assert verdict.ok, verdict.detail


def test_accepts_reusing_a_figure_already_in_the_cv(
    document: CVDocument, source: SourceMaterial
) -> None:
    """Figures may move between lines — they may not appear from nowhere."""
    node = _bullet(document, "idempotency keys")
    verdict = validate(
        _suggest(node, "Introduced idempotency keys across the payments API used by 40 staff."),
        document=document,
        source=source,
        job=JOB,
    )
    assert verdict.ok, verdict.detail


def test_accepts_a_number_word_written_as_a_figure(
    document: CVDocument, source: SourceMaterial
) -> None:
    """ "Cut the nightly batch run by half" may become "by 50%"."""
    node = _bullet(document, "nightly batch")
    verdict = validate(
        _suggest(node, "Cut the nightly batch run by 50%."), document=document, source=source
    )
    assert verdict.ok, verdict.detail


def test_accepts_a_reformatted_figure(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "reporting tools")
    verdict = validate(
        _suggest(node, "Built internal reporting tools used by 40.0 staff across the business."),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail


# ═══════════════════════════════════════════════════════════════════════════
# Figures — the most damaging thing to invent
# ═══════════════════════════════════════════════════════════════════════════


def test_rejects_an_invented_figure(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "idempotency keys")
    verdict = validate(
        _suggest(
            node, "Introduced idempotency keys, eliminating 12,000 duplicate charges a month."
        ),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "invented_figure"


def test_rejects_an_inflated_figure(document: CVDocument, source: SourceMaterial) -> None:
    """The classic failure: 50 minutes quietly becomes 90."""
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(node, "Rebuilt the settlement pipeline, cutting processing from 90 minutes to 7."),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "invented_figure"


def test_rejects_an_invented_percentage(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "reporting tools")
    verdict = validate(
        _suggest(node, "Built internal reporting tools used by 40 staff, cutting effort by 35%."),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "invented_figure"


def test_rejects_an_invented_team_size(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "Mentored two junior")
    verdict = validate(
        _suggest(node, "Mentored eight junior engineers through their first on-call rotations."),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "invented_figure"


# ═══════════════════════════════════════════════════════════════════════════
# Names and technologies
# ═══════════════════════════════════════════════════════════════════════════


def test_rejects_an_invented_employer(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(node, "Rebuilt the settlement pipeline for Stripe and Adyen integrations."),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "invented_name"


def test_rejects_a_technology_from_the_job_post(
    document: CVDocument, source: SourceMaterial
) -> None:
    """The most tempting fabrication of all: the advert asks for Kubernetes, so
    the model helpfully adds Kubernetes. This person has never used it."""
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(node, "Rebuilt the settlement pipeline and deployed it on Kubernetes."),
        document=document,
        source=source,
        job=JOB,
    )
    assert not verdict.ok
    assert verdict.rejection in {"invented_name", "invented_technology"}


def test_rejects_an_invented_acronym(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "idempotency keys")
    verdict = validate(
        _suggest(node, "Introduced idempotency keys across the payments API and gRPC services."),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection in {"invented_name", "invented_technology"}


# ═══════════════════════════════════════════════════════════════════════════
# Provenance
# ═══════════════════════════════════════════════════════════════════════════


def test_rejects_a_quote_that_is_not_in_the_cited_source(
    document: CVDocument, source: SourceMaterial
) -> None:
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(
            node,
            "Rebuilt the settlement pipeline, cutting processing to 7 minutes.",
            quote="Led the migration of forty services with zero downtime.",
        ),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "unquotable_provenance"


def test_rejects_a_citation_of_a_node_that_does_not_exist(
    document: CVDocument, source: SourceMaterial
) -> None:
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Rebuilt the settlement pipeline to run in 7 minutes.")
    suggestion.provenance.source_id = "nod_deadbeef00"

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "unquotable_provenance"


def test_rejects_an_empty_provenance_quote(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Rebuilt the settlement pipeline to run in 7 minutes.")
    suggestion.provenance.quote = "   "

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "missing_provenance"


# ═══════════════════════════════════════════════════════════════════════════
# Anchoring and scope
# ═══════════════════════════════════════════════════════════════════════════


def test_rejects_a_stale_anchor(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Rebuilt the settlement pipeline to run in 7 minutes.")
    node.text = "The user rewrote this line themselves while the model was thinking."

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "stale_anchor"


def test_rejects_editing_a_job_title(document: CVDocument, source: SourceMaterial) -> None:
    """A promotion is not a rewrite. Entry headings are never editable."""
    heading = next(
        node
        for section in document.sections
        for entry in section.entries
        for node in entry.heading_nodes
    )
    suggestion = Suggestion(
        node_id=heading.id,
        before=heading.text,
        after=heading.text.replace("Backend Engineer", "Principal Backend Engineer"),
        reason="Aligns with the seniority in the post.",
        provenance=Provenance(kind="cv_node", source_id=heading.id, quote=heading.text),
        confidence="high",
    )

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "not_editable"


def test_rejects_an_unknown_node(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Anything at all.")
    suggestion.node_id = "nod_notreal0000"

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "unknown_node"


def test_rejects_a_no_op(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    verdict = validate(_suggest(node, node.text), document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "no_change"


# ═══════════════════════════════════════════════════════════════════════════
# Score gaming
# ═══════════════════════════════════════════════════════════════════════════


def test_rejects_keyword_stuffing(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(
            node,
            "Rebuilt the payments settlement pipeline: payments processing, payments "
            "reconciliation and payments reporting.",
        ),
        document=document,
        source=source,
        job=JOB,
    )
    assert not verdict.ok
    assert verdict.rejection == "keyword_stuffing"


# ═══════════════════════════════════════════════════════════════════════════
# Flags — allowed through, but surfaced
# ═══════════════════════════════════════════════════════════════════════════


def test_flags_a_term_borrowed_from_the_advert(
    document: CVDocument, source: SourceMaterial
) -> None:
    """ "microservices" is the employer's word for work this person may well have
    done. Allowed — but they must agree it describes them."""
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(node, "Rebuilt the settlement pipeline across microservices, now 7 minutes."),
        document=document,
        source=source,
        job=JOB,
    )
    assert verdict.ok, verdict.detail
    assert verdict.needs_confirmation
    assert any(flag.kind == "borrowed_term" for flag in verdict.flags)


def test_flags_a_rewrite_that_balloons(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "nightly batch")
    verdict = validate(
        _suggest(
            node,
            "Cut the nightly batch run by half, working through the scheduling logic "
            "line by line and reworking the parts that had grown slow over time, then "
            "confirming the result held across a full week of production runs.",
        ),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail
    assert any(flag.kind == "much_longer" for flag in verdict.flags)


def test_flags_a_low_confidence_suggestion(document: CVDocument, source: SourceMaterial) -> None:
    node = _bullet(document, "nightly batch")
    verdict = validate(
        _suggest(node, "Cut the nightly batch run by 50%.", confidence="low"),
        document=document,
        source=source,
    )
    assert verdict.ok
    assert any(flag.kind == "low_confidence" for flag in verdict.flags)


# ═══════════════════════════════════════════════════════════════════════════
# The Story Bank as a source
# ═══════════════════════════════════════════════════════════════════════════


def test_accepts_a_claim_grounded_in_the_story_bank(document: CVDocument) -> None:
    """The Story Bank is the person's own record, so it is valid evidence —
    that is the whole point of writing each achievement once."""
    stories = {
        "sty_001": "Led the Kubernetes migration of 12 services at Halcyon Pay over one quarter."
    }
    source = SourceMaterial.build(document, stories)
    node = _bullet(document, "settlement pipeline")

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Rebuilt the settlement pipeline and led its Kubernetes migration.",
            reason="The post requires Kubernetes in production.",
            provenance=Provenance(
                kind="story_item",
                source_id="sty_001",
                quote="Led the Kubernetes migration of 12 services at Halcyon Pay",
            ),
            confidence="high",
        ),
        document=document,
        source=source,
        job=JOB,
    )
    assert verdict.ok, verdict.detail


def test_story_bank_does_not_launder_unrelated_inventions(document: CVDocument) -> None:
    """Citing a real story does not license adding something the story never said."""
    stories = {"sty_001": "Led the Kubernetes migration of 12 services at Halcyon Pay."}
    source = SourceMaterial.build(document, stories)
    node = _bullet(document, "settlement pipeline")

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Rebuilt the settlement pipeline and led the Kubernetes migration at Monzo.",
            reason="The post requires Kubernetes.",
            provenance=Provenance(
                kind="story_item", source_id="sty_001", quote="Led the Kubernetes migration"
            ),
            confidence="high",
        ),
        document=document,
        source=source,
        job=JOB,
    )
    assert not verdict.ok
    assert verdict.rejection == "invented_name"


def test_job_post_is_never_treated_as_source_material(document: CVDocument) -> None:
    """The advert describes the employer's wishes, not the applicant's history."""
    source = SourceMaterial.build(document)
    assert "kubernetes" not in source.vocabulary


# ═══════════════════════════════════════════════════════════════════════════
# False accusations — the other way this fails
# ═══════════════════════════════════════════════════════════════════════════


def test_a_skill_listed_after_a_label_is_not_an_invention() -> None:
    """Regression: a real CV was told it had invented "HTML5" — a word printed
    in its own skills section.

    Skills are written as "Web Development: HTML5, CSS3, …". A capital straight
    after a colon does not prove a word is a name, so the strict extractor
    skipped it when reading the CV — but counted it when it appeared
    mid-sentence in a rewrite. The source side has to be permissive.
    """
    document = parse_pasted(
        "Yash Rao\nyash@example.com\n\nTECHNICAL SKILLS\n"
        "Web Development: HTML5, CSS3, JavaScript, React.js, Node.js, Express.js, REST API\n"
        "Programming: Python, C, C++, Java, SQL\n"
    )
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if "HTML5" in n.text)

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Web Development: React.js, REST API, HTML5, CSS3, JavaScript, Node.js, Express.js",
            reason="Leads with the two the post names, keeping everything else.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail


# ═══════════════════════════════════════════════════════════════════════════
# Tailoring by subtraction — the other way to make a CV worse
# ═══════════════════════════════════════════════════════════════════════════


def _skills_document() -> CVDocument:
    return parse_pasted(
        "Yash Rao\nyash@example.com\n\nTECHNICAL SKILLS\n"
        "Programming: Python, C, C++, Java, SQL\n"
        "Web Development: HTML5, CSS3, JavaScript, React.js, Node.js, Express.js, REST API\n"
    )


def test_rejects_deleting_skills_the_person_has() -> None:
    """Asked to focus a CV on one post, a model will happily delete every skill
    the post did not name. The person still knows C++, and the next reader is
    still looking for it."""
    document = _skills_document()
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if n.text.startswith("Programming"))

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Programming: Python, SQL",
            reason="The post emphasises Python and SQL.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "dropped_skill"
    assert "C++" in verdict.detail or "Java" in verdict.detail


def test_reordering_does_not_look_like_deletion() -> None:
    """Moving a term to the front of a line must not be reported as removing it.

    Regression: "…, React.js, REST API" reordered to "REST API, React.js, …"
    was flagged as removing REST, because a capital straight after the label's
    colon is not counted as a name — the same position sensitivity that caused
    the HTML5 false accusation, in the mirror-image check.
    """
    document = _skills_document()
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if n.text.startswith("Web Development"))

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Web Development: REST API, React.js, HTML5, CSS3, JavaScript, Node.js, Express.js",
            reason="Leads with what the post names.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail
    assert not [f for f in verdict.flags if f.kind == "dropped_detail"], (
        f"reorder reported as deletion: {[f.detail for f in verdict.flags]}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# The lead-in that says where the work happened
# ═══════════════════════════════════════════════════════════════════════════


def _titled_document() -> CVDocument:
    return parse_pasted(
        "Yash Rao\nyash@example.com\n\nKEY PROJECTS\n"
        "- AI Academic Assistant (RAG System) - Designed and implemented a retrieval pipeline.\n"
        "\nINTERNSHIP EXPERIENCE\n"
        "- Data Science Intern - CSC India: Conducted data cleaning and exploratory analysis.\n"
    )


def test_rejects_dropping_the_employer_from_the_front_of_a_bullet() -> None:
    """Graduate CVs put the role and employer inside the bullet. Rewriting for
    punch reliably deletes them, and with them the only statement of where the
    person actually worked."""
    document = _titled_document()
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if "CSC India" in n.text)

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Conducted data cleaning and exploratory data analysis.",
            reason="Leads with the analysis work the post asks for.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=document,
        source=source,
    )
    assert not verdict.ok
    assert verdict.rejection == "dropped_title"
    assert "CSC India" in verdict.detail


def test_accepts_a_rewrite_that_keeps_the_lead_in() -> None:
    document = _titled_document()
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if "RAG System" in n.text)

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="AI Academic Assistant (RAG System) - Built and evaluated a retrieval pipeline.",
            reason="Uses the post's wording for evaluation.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail


def test_ordinary_prose_bullets_are_unaffected(
    document: CVDocument, source: SourceMaterial
) -> None:
    """The rule must not fire on a bullet that merely contains a dash."""
    node = _bullet(document, "settlement pipeline")
    verdict = validate(
        _suggest(node, "Rebuilt the settlement pipeline, cutting processing to 7 minutes from 50."),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail


# ═══════════════════════════════════════════════════════════════════════════
# Concision that is really just vagueness
# ═══════════════════════════════════════════════════════════════════════════


def test_flags_a_rewrite_that_only_removes_specifics() -> None:
    """ "Frontend developer building customer-facing web applications" shortened
    to "Developer building applications" invents nothing and drops no number, so
    every truth check passes — while making the person sound less like
    themselves. Shorter is not automatically better."""
    document = parse_pasted(
        "Rahul Menon\nrahul@example.com\n\nSUMMARY\n"
        "Frontend developer with three years building customer-facing web applications.\n"
    )
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if "Frontend" in n.text)

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Developer with three years building applications.",
            reason="Tightens the summary.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="medium",
        ),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail
    assert any(flag.kind == "less_specific" for flag in verdict.flags), (
        f"expected a vagueness flag, got {[f.kind for f in verdict.flags]}"
    )


def test_removing_only_filler_is_not_flagged() -> None:
    """Cutting "Was responsible for" is the entire point of tightening a bullet."""
    padded = parse_pasted(
        "Ada Lovelace\nada@example.com\n\nEXPERIENCE\n\n"
        "Analyst, Engine Co — Jan 2020 – Present\n"
        "- Was responsible for working on the reporting tools used by 40 staff.\n"
    )
    source = SourceMaterial.build(padded)
    node = next(n for n in padded.editable_nodes if "reporting tools" in n.text)

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Built the reporting tools used by 40 staff.",
            reason="Leads with what was done.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=padded,
        source=source,
    )
    assert verdict.ok, verdict.detail
    assert not [f for f in verdict.flags if f.kind == "less_specific"], (
        f"tightening mistaken for vagueness: {[f.detail for f in verdict.flags]}"
    )


def test_an_even_trade_of_wording_is_not_flagged(
    document: CVDocument, source: SourceMaterial
) -> None:
    """Swapping the CV's words for the employer's is a trade, not a loss."""
    node = _bullet(document, "nightly batch")
    verdict = validate(
        _suggest(node, "Reduced nightly batch processing duration by 50%."),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail
    assert not [f for f in verdict.flags if f.kind == "less_specific"]


# ═══════════════════════════════════════════════════════════════════════════
# Anchor repair
# ═══════════════════════════════════════════════════════════════════════════


def test_a_partially_quoted_long_line_is_repaired(
    document: CVDocument, source: SourceMaterial
) -> None:
    """Models quote the opening of a long bullet and stop. That identifies the
    line unambiguously, so the suggestion is kept and the quote corrected."""
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Rebuilt the settlement pipeline; it now runs in 7 minutes.")
    suggestion.before = node.text[: int(len(node.text) * 0.7)]

    verdict = validate(suggestion, document=document, source=source)
    assert verdict.ok, verdict.detail
    assert suggestion.before == node.text, "the anchor should be corrected in place"


def test_a_quote_from_a_different_line_is_still_stale(
    document: CVDocument, source: SourceMaterial
) -> None:
    """Repair must not become a way to bypass the anchor check entirely."""
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Anything at all.")
    suggestion.before = "Mentored two junior engineers through their first on-call rotations."

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "stale_anchor"


def test_a_quote_too_short_to_identify_is_stale(
    document: CVDocument, source: SourceMaterial
) -> None:
    node = _bullet(document, "settlement pipeline")
    suggestion = _suggest(node, "Rebuilt it faster.")
    suggestion.before = "Rebuilt"

    verdict = validate(suggestion, document=document, source=source)
    assert not verdict.ok
    assert verdict.rejection == "stale_anchor"


def test_accepts_reordering_skills_for_emphasis() -> None:
    """Emphasis is the whole point; subtraction is not."""
    document = _skills_document()
    source = SourceMaterial.build(document)
    node = next(n for n in document.editable_nodes if n.text.startswith("Programming"))

    verdict = validate(
        Suggestion(
            node_id=node.id,
            before=node.text,
            after="Programming: Python, SQL, Java, C, C++",
            reason="Leads with the languages this post names.",
            provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
            confidence="high",
        ),
        document=document,
        source=source,
    )
    assert verdict.ok, verdict.detail


@pytest.mark.parametrize(
    "term",
    ["HTML5", "React.js", "C++", "REST API", "Node.js", "SQL", "Express.js"],
)
def test_every_listed_technology_is_known_to_the_validator(term: str) -> None:
    document = parse_pasted(
        "Yash Rao\nyash@example.com\n\nTECHNICAL SKILLS\n"
        "Web Development: HTML5, CSS3, JavaScript, React.js, Node.js, Express.js, REST API\n"
        "Programming: Python, C, C++, Java, SQL\n"
    )
    source = SourceMaterial.build(document)
    from aptly.validate.entities import proper_nouns, technical_tokens

    for token in proper_nouns(term) | technical_tokens(term):
        assert source.knows(token), f"{term!r} should be recognised via {token!r}"
