"""A summary may not change what the person says they are.

Regression cover for an observed failure. Given a frontend developer's CV and a
data-engineering post, the tailoring pass produced a summary asserting the
person was a data professional building production pipelines, and every existing
layer passed it: no invented figure, no invented technology, no lost employer,
no stuffing. The sentence just described somebody else.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.llm.schemas import Provenance, Suggestion
from aptly.model.document import CVDocument
from aptly.validate import SourceMaterial, validate

CV = """\
Rahul Menon
rahul.menon@example.com | +91 98450 21134 | Bengaluru

PROFESSIONAL SUMMARY
Frontend developer with three years building customer-facing web applications.

TECHNICAL SKILLS
Languages: JavaScript, TypeScript, Python, HTML5, CSS3
Backend & Data: Node.js, Express.js, REST APIs, PostgreSQL, SQL

WORK EXPERIENCE

Frontend Developer, Kalyra Commerce — 2022 – Present
- Built the internal pricing dashboard, writing the SQL queries that pull from PostgreSQL.
"""


@pytest.fixture
def document() -> CVDocument:
    return parse_pasted(CV)


@pytest.fixture
def source(document: CVDocument) -> SourceMaterial:
    return SourceMaterial.build(document)


def _summary(document: CVDocument):
    return next(node for node in document.editable_nodes if node.role == "summary")


def _suggestion(node, after: str) -> Suggestion:
    return Suggestion(
        node_id=node.id,
        before=node.text,
        after=after,
        reason="The post asks for data engineering experience.",
        provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
        confidence="high",
    )


def test_the_observed_failure_is_now_rejected(document: CVDocument, source: SourceMaterial) -> None:
    node = _summary(document)
    verdict = validate(
        _suggestion(
            node,
            "Data professional with three years building production data pipelines.",
        ),
        document=document,
        source=source,
    )

    assert not verdict.ok
    assert verdict.rejection == "changed_self_description"


def test_rewording_the_same_identity_is_allowed(
    document: CVDocument, source: SourceMaterial
) -> None:
    """The rule is about the claim, not about the wording of it."""
    node = _summary(document)
    verdict = validate(
        _suggestion(
            node,
            "Frontend developer with three years building customer-facing web "
            "applications, including the SQL behind their internal dashboards.",
        ),
        document=document,
        source=source,
    )

    assert verdict.ok, verdict.detail


def test_reordering_the_rest_of_the_sentence_is_allowed(
    document: CVDocument, source: SourceMaterial
) -> None:
    node = _summary(document)
    verdict = validate(
        _suggestion(
            node,
            "Frontend developer who writes the SQL and PostgreSQL queries behind "
            "the products they build, with three years in production.",
        ),
        document=document,
        source=source,
    )

    assert verdict.ok, verdict.detail


def test_an_identity_the_cv_supports_elsewhere_survives(
    document: CVDocument, source: SourceMaterial
) -> None:
    """Leading with something the CV already says is emphasis, not invention."""
    node = _summary(document)
    verdict = validate(
        _suggestion(
            node,
            "Frontend engineer with three years building customer-facing applications.",
        ),
        document=document,
        source=source,
    )

    assert verdict.ok, verdict.detail


def test_a_bullet_may_still_open_however_it_likes(
    document: CVDocument, source: SourceMaterial
) -> None:
    """The rule is narrow: only the summary's subject is an identity claim."""
    bullet = next(node for node in document.editable_nodes if node.role == "bullet")
    verdict = validate(
        _suggestion(
            bullet,
            "Wrote the SQL queries behind the internal pricing dashboard, pulling from PostgreSQL.",
        ),
        document=document,
        source=source,
    )

    assert verdict.ok, verdict.detail
