"""The tailoring pipeline, end to end, without touching the network.

A stub client returns canned model output so the orchestration, the validator
and the SSE endpoint are all exercised on every test run rather than only when
someone has a key configured.

This suite exists because the wiring between those pieces is exactly the kind of
thing that breaks silently: a client that is constructed and then not passed on
fails only at the moment a real key makes the code path reachable.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import pytest
from aptly.analyse.schemas import CVAnalysis, JobAnalysis, SectionAssessment
from aptly.ingest import parse_pasted
from aptly.llm.client import Completion, Usage
from aptly.llm.schemas import (
    JobPost,
    Provenance,
    Requirement,
    Suggestion,
    SuggestionBatch,
)
from aptly.llm.tailor import Change, CoverageReady, JobParsed, RunDone, tailor
from aptly.model.document import CVDocument

CV = """\
Nadia Haddad
nadia.haddad@example.com | +44 7700 900321 | Leeds

SUMMARY
Data engineer with five years building pipelines for retail analytics.

EXPERIENCE

Data Engineer, Brightfold Retail — Feb 2021 – Present
- Built the nightly ingestion pipeline that loads 2.4 million rows across 30 stores.
- Cut the reporting refresh from 4 hours to 35 minutes by rewriting the aggregation layer.
- Introduced data quality checks that caught 12 schema breaks before they reached dashboards.

Analyst, Kestrel Group — Aug 2018 – Jan 2021
- Automated the weekly sales report, saving the team a full day each week.

EDUCATION
BSc Mathematics, University of Leeds — 2014 – 2018

SKILLS
Python, SQL, Airflow, dbt, Snowflake
"""

JOB_TEXT = """\
Senior Data Engineer — Northwind Analytics
We need someone who can own ingestion pipelines end to end, improve refresh times,
and bring rigour to data quality. Python and SQL essential. dbt experience valued.
"""

JOB = JobPost(
    company="Northwind Analytics",
    role="Senior Data Engineer",
    keywords=["Python", "SQL", "dbt", "data quality", "Kubernetes"],
    requirements=[
        Requirement(
            text="Python and SQL",
            keywords=["Python", "SQL"],
            keywords_match="all",
            essential=True,
        )
    ],
)


@dataclass
class _Reply:
    """One canned model response, matched by the schema being requested."""

    schema: type
    value: Any


class StubClient:
    """Stands in for :class:`GeminiClient`, returning fixed structured output."""

    main_model = "stub-main"
    fast_model = "stub-fast"
    vision_model = "stub-vision"

    def __init__(self, replies: list[_Reply]) -> None:
        self._replies = replies
        self._served: set[type] = set()
        self.calls: list[str] = []

    async def embed(self, texts, *, task_type: str = "", purpose: str = "") -> list[list[float]]:
        """Deterministic pseudo-embeddings.

        The gap map degrades to a literal-only reading when embedding fails, and
        that path is worth exercising rather than mocking away — but it must not
        depend on the network. These vectors carry no meaning; the literal and
        judged readers decide everything in this suite.
        """
        return [[0.0] * 8 for _ in texts]

    async def structured(self, *, schema, purpose: str = "", **_: object):
        self.calls.append(purpose)
        for reply in self._replies:
            if reply.schema is not schema:
                continue
            # Sections are tailored in parallel, one call each. Only the section
            # that owns the node returns suggestions; the rest legitimately find
            # nothing, so a canned batch is served exactly once.
            value = reply.value
            if schema is SuggestionBatch and schema in self._served:
                value = SuggestionBatch(suggestions=[])
            self._served.add(schema)

            return Completion(
                value=value,
                usage=Usage(
                    model="stub",
                    input_tokens=1000,
                    output_tokens=200,
                    cost_usd=0.001,
                    seconds=0.1,
                ),
            )
        raise AssertionError(f"no stubbed reply for {schema.__name__}")


@pytest.fixture
def document() -> CVDocument:
    return parse_pasted(CV)


def _bullet(document: CVDocument, contains: str):
    return next(node for node in document.editable_nodes if contains in node.text)


def _replies(document: CVDocument, suggestions: list[Suggestion]) -> list[_Reply]:
    return [
        _Reply(JobAnalysis, JobAnalysis(post=JOB, optimises_for="Owning ingestion end to end.")),
        _Reply(
            CVAnalysis,
            CVAnalysis(
                positioning="Reads as a data engineer with real pipeline ownership.",
                sections=[
                    SectionAssessment(
                        section_id=section.id,
                        relevance="critical" if section.kind == "experience" else "useful",
                        verdict="Carries the application.",
                    )
                    for section in document.sections
                ],
            ),
        ),
        _Reply(SuggestionBatch, SuggestionBatch(suggestions=suggestions)),
    ]


async def _run(document: CVDocument, suggestions: list[Suggestion]) -> list:
    client = StubClient(_replies(document, suggestions))
    return [event async for event in tailor(document, JOB_TEXT, client=client)]  # type: ignore[arg-type]


# ═══════════════════════════════════════════════════════════════════════════
# Orchestration
# ═══════════════════════════════════════════════════════════════════════════


async def test_a_clean_suggestion_reaches_the_user(document: CVDocument) -> None:
    node = _bullet(document, "nightly ingestion")
    events = await _run(
        document,
        [
            Suggestion(
                node_id=node.id,
                before=node.text,
                after="Owned the nightly ingestion pipeline end to end, loading 2.4 million rows across 30 stores.",
                reason="The post asks for ownership of ingestion pipelines end to end.",
                provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
                confidence="high",
            )
        ],
    )

    assert any(isinstance(event, JobParsed) for event in events)
    assert any(isinstance(event, CoverageReady) for event in events)
    changes = [event for event in events if isinstance(event, Change)]
    assert len(changes) == 1
    assert "end to end" in changes[0].suggestion.after


async def test_a_fabricated_suggestion_never_reaches_the_user(document: CVDocument) -> None:
    """The validator sits between the model and the screen, and this proves it."""
    node = _bullet(document, "nightly ingestion")
    events = await _run(
        document,
        [
            Suggestion(
                node_id=node.id,
                before=node.text,
                after="Built the nightly ingestion pipeline on Kubernetes, loading 9 million rows.",
                reason="The post mentions Kubernetes.",
                provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
                confidence="high",
            )
        ],
    )

    assert not [event for event in events if isinstance(event, Change)]
    done = next(event for event in events if isinstance(event, RunDone))
    assert done.rejected == 1
    assert done.accepted == 0
    assert done.rejections


async def test_the_run_reports_what_it_discarded(document: CVDocument) -> None:
    """The count is shown in the UI — it is how the promise becomes visible."""
    node = _bullet(document, "reporting refresh")
    events = await _run(
        document,
        [
            Suggestion(
                node_id=node.id,
                before=node.text,
                after="Cut the reporting refresh from 4 hours to 9 minutes.",
                reason="Faster is better.",
                provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
                confidence="high",
            )
        ],
    )
    done = next(event for event in events if isinstance(event, RunDone))
    assert done.rejections.get("invented_figure") == 1


async def test_the_run_is_priced(document: CVDocument) -> None:
    node = _bullet(document, "data quality checks")
    events = await _run(
        document,
        [
            Suggestion(
                node_id=node.id,
                before=node.text,
                after="Introduced data quality checks that caught 12 schema breaks before dashboards.",
                reason="The post asks for rigour in data quality.",
                provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
                confidence="high",
            )
        ],
    )
    done = next(event for event in events if isinstance(event, RunDone))
    assert done.cost_usd > 0
    assert done.seconds >= 0


# ═══════════════════════════════════════════════════════════════════════════
# The endpoint
# ═══════════════════════════════════════════════════════════════════════════


def test_the_sse_endpoint_streams_change_cards(
    monkeypatch: pytest.MonkeyPatch, document: CVDocument
) -> None:
    """Covers the wiring from HTTP request through to serialised SSE frames."""
    import aptly.api.tailor as endpoint
    from aptly.main import app
    from fastapi.testclient import TestClient

    node = _bullet(document, "nightly ingestion")
    suggestion = Suggestion(
        node_id=node.id,
        before=node.text,
        after="Owned the nightly ingestion pipeline end to end across 30 stores.",
        reason="The post asks for end-to-end ownership of ingestion.",
        provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
        confidence="high",
    )
    monkeypatch.setattr(
        endpoint, "GeminiClient", lambda: StubClient(_replies(document, [suggestion]))
    )
    # Quota is per-process and other tests may have consumed it.
    monkeypatch.setattr(endpoint, "check_tailor_quota", lambda _request: 3)

    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/tailor",
        json={"document": document.model_dump(mode="json"), "job_text": JOB_TEXT},
    ) as response:
        assert response.status_code == 200
        payloads = [
            json.loads(line[5:].strip())
            for line in response.iter_lines()
            if line.startswith("data:")
        ]

    kinds = [payload["kind"] for payload in payloads]
    assert "start" in kinds
    assert "job" in kinds
    assert "suggestion" in kinds
    assert "done" in kinds
    assert "error" not in kinds

    card = next(payload for payload in payloads if payload["kind"] == "suggestion")
    assert card["suggestion"]["node_id"] == node.id
    assert card["suggestion"]["provenance"]["quote"]


def test_the_stream_uses_crlf_frame_separators(
    monkeypatch: pytest.MonkeyPatch, document: CVDocument
) -> None:
    """Pin the wire format, because the browser has to split on it.

    The client once searched for a bare "\\n\\n" boundary, which never occurs in
    a CRLF stream — "\\r\\n\\r\\n" has a carriage return between the newlines. The
    result was invisible: every event was delivered, none was parsed, and the
    page reported that there was nothing worth changing. Nothing logged, nothing
    errored, and the API looked perfectly healthy.

    If this assertion ever fails, `streamTailor` in frontend/src/lib/api.ts has
    to change with it.
    """
    import aptly.api.tailor as endpoint
    from aptly.main import app
    from fastapi.testclient import TestClient

    node = _bullet(document, "nightly ingestion")
    suggestion = Suggestion(
        node_id=node.id,
        before=node.text,
        after="Owned the nightly ingestion pipeline end to end across 30 stores.",
        reason="The post asks for end-to-end ownership.",
        provenance=Provenance(kind="cv_node", source_id=node.id, quote=node.text),
        confidence="high",
    )
    monkeypatch.setattr(
        endpoint, "GeminiClient", lambda: StubClient(_replies(document, [suggestion]))
    )
    monkeypatch.setattr(endpoint, "check_tailor_quota", lambda _request: 3)

    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/tailor",
        json={"document": document.model_dump(mode="json"), "job_text": JOB_TEXT},
    ) as response:
        raw = b"".join(response.iter_raw())

    assert b"\r\n\r\n" in raw, "frames are CRLF-separated; the browser parser depends on it"

    # And the normalisation the client performs must recover every frame.
    frames = [f for f in raw.decode().replace("\r\n", "\n").split("\n\n") if f.strip()]
    kinds = [
        json.loads(line[5:].strip())["kind"]
        for frame in frames
        for line in frame.split("\n")
        if line.startswith("data:")
    ]
    assert "start" in kinds
    assert "suggestion" in kinds
    assert "done" in kinds
