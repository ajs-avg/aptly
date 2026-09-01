"""The CV agent — what it may do, and what it must refuse.

The interesting tests are the refusals. "Add the skills from the job post" is
the most natural thing in the world to ask and the single most damaging thing
to do, so the check that stops it is the feature rather than a guard on it.
"""

from __future__ import annotations

import pytest
from aptly.agent import _check, _clean_facts, _scale
from aptly.agent.prompts import agent_user
from aptly.agent.schemas import AgentEdit, AgentReply, AgentTurn
from aptly.ingest import parse_pasted
from aptly.validate import SourceMaterial

CV = """Aman Mishra
aman@example.com | +91 98765 43210

SUMMARY
Product manager with six years across hardware and software launches.

EXPERIENCE
Senior Product Manager, Kalyra - Jan 2021 to Dec 2024
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.
- Ran discovery with 40 customers.
"""


def _document():
    return parse_pasted(CV)


def _source(document, extra: str = ""):
    return SourceMaterial.build(document, None, extra=extra)


def _bullet(document):
    return next(n for n in document.nodes if n.role == "bullet")


# ═══════════════════════════════════════════════════════════════════════════
# What it may not write
# ═══════════════════════════════════════════════════════════════════════════


def test_a_technology_the_person_never_mentioned_is_refused() -> None:
    """The request this exists for: "they want Kubernetes, add Kubernetes"."""
    document = _document()
    node = _bullet(document)
    reply = AgentReply(
        reply="Added it.",
        edits=[
            AgentEdit(
                node_id=node.id,
                before=node.text,
                after="Rebuilt the onboarding flow and deployed it on Kubernetes.",
                reason="The post asks for Kubernetes.",
            )
        ],
    )

    kept, refused = _check(reply, document, _source(document))

    assert kept == []
    assert len(refused) == 1


def test_a_refusal_says_what_would_change_it() -> None:
    """An agent that only says no is one people stop asking."""
    document = _document()
    node = _bullet(document)
    reply = AgentReply(
        reply="",
        edits=[
            AgentEdit(
                node_id=node.id,
                before=node.text,
                after="Led the migration to Kubernetes.",
                reason="x",
            )
        ],
    )

    _, refused = _check(reply, document, _source(document))

    assert "tell me where" in refused[0].why.lower() or "say where" in refused[0].why.lower()


def test_an_invented_figure_is_refused() -> None:
    document = _document()
    node = _bullet(document)
    reply = AgentReply(
        reply="",
        edits=[
            AgentEdit(
                node_id=node.id,
                before=node.text,
                after="Cut new-site ramp time by 73% by rebuilding the onboarding flow.",
                reason="x",
            )
        ],
    )

    kept, refused = _check(reply, document, _source(document))

    assert kept == []
    assert refused


def test_a_rewrite_of_what_is_there_is_allowed() -> None:
    """Rephrasing is the whole job. It must not be caught by the check."""
    document = _document()
    node = _bullet(document)
    reply = AgentReply(
        reply="",
        edits=[
            AgentEdit(
                node_id=node.id,
                before=node.text,
                after="Rebuilt the onboarding flow, cutting new-site ramp time from 12 weeks to 6.",
                reason="Leads with the outcome this post asks about.",
            )
        ],
    )

    kept, refused = _check(reply, document, _source(document))

    assert len(kept) == 1
    assert refused == []


def test_something_they_just_told_the_agent_may_be_written() -> None:
    """Their own words are their own words whether they wrote them last year or
    thirty seconds ago. Without this the agent is handed a GitHub link and then
    refused permission to use it."""
    document = _document()
    node = _bullet(document)
    said = "my github is github.com/amanm"
    reply = AgentReply(
        reply="",
        edits=[
            AgentEdit(
                node_id=node.id,
                kind="add",
                after="github.com/amanm",
                reason="A link this post asks for.",
            )
        ],
    )

    kept, _ = _check(reply, document, _source(document, extra=said))

    assert len(kept) == 1


def test_the_job_post_is_not_evidence_about_the_applicant() -> None:
    """The agent is exactly where somebody asks for the advert to be treated as
    though it were, so the pool must still exclude it."""
    document = _document()
    source = _source(document)

    assert "kubernetes" not in source.text.lower()


# ═══════════════════════════════════════════════════════════════════════════
# Editing a line that moved
# ═══════════════════════════════════════════════════════════════════════════


def test_an_edit_to_a_line_that_changed_is_refused() -> None:
    """Their own edit outranks a proposal made before they made it."""
    document = _document()
    node = _bullet(document)
    reply = AgentReply(
        reply="",
        edits=[
            AgentEdit(
                node_id=node.id,
                before="Something this line no longer says.",
                after="Anything.",
                reason="x",
            )
        ],
    )

    kept, refused = _check(reply, document, _source(document))

    assert kept == []
    assert "changed while" in refused[0].why


def test_an_edit_to_a_line_that_is_gone_is_refused() -> None:
    document = _document()
    reply = AgentReply(
        reply="",
        edits=[AgentEdit(node_id="nod_nonexistent", before="x", after="y", reason="x")],
    )

    kept, refused = _check(reply, document, _source(document))

    assert kept == []
    assert refused


# ═══════════════════════════════════════════════════════════════════════════
# Small change or large one
# ═══════════════════════════════════════════════════════════════════════════


def test_one_short_edit_is_small() -> None:
    assert _scale([AgentEdit(node_id="a", after="Tightened.", reason="x")]) == "small"


def test_several_edits_are_large() -> None:
    """Three lines changed at once is something to read, not scan — and being
    asked to read it in a list of change cards is how it gets applied unread."""
    edits = [AgentEdit(node_id=str(i), after="Short.", reason="x") for i in range(3)]

    assert _scale(edits) == "large"


def test_one_very_long_rewrite_is_large() -> None:
    assert _scale([AgentEdit(node_id="a", after="x" * 500, reason="y")]) == "large"


# ═══════════════════════════════════════════════════════════════════════════
# What crosses between the two agents
# ═══════════════════════════════════════════════════════════════════════════


def test_facts_are_bounded_on_both_sides() -> None:
    """A key is a label, and a "fact" recorded at four hundred characters is a
    summary of the conversation rather than a fact from it."""
    from aptly.agent.schemas import LearnedFact

    cleaned = _clean_facts(
        [LearnedFact(key="K" * 100, value="v" * 900)]
        + [LearnedFact(key=f"k{i}", value="v") for i in range(40)]
    )

    assert len(cleaned) <= 20
    assert all(len(key) <= 40 for key in cleaned)
    assert all(len(value) <= 300 for value in cleaned.values())


def test_shared_facts_reach_the_prompt() -> None:
    """The whole mechanism for "told the left agent, the right one knows"."""
    prompt = agent_user(
        document=_document(),
        job_text="",
        instruction="add my github",
        history=[],
        facts={"github": "github.com/amanm"},
        side="rebuilt",
    )

    assert "github.com/amanm" in prompt
    assert "told you this session" in prompt


def test_the_agent_is_told_it_cannot_see_the_other_document() -> None:
    prompt = agent_user(
        document=_document(),
        job_text="",
        instruction="make the other one match this",
        history=[],
        facts={},
        side="tailored",
    )

    assert "cannot see the other one" in prompt


def test_missing_contact_details_are_named_for_it_to_ask_about() -> None:
    """A CV with no GitHub link is the commonest useful thing to ask an
    engineer for, and an agent left to notice the absence usually does not."""
    document = parse_pasted("Aman Mishra\naman@example.com\n\nSUMMARY\nA PM.\n")

    prompt = agent_user(
        document=document, job_text="", instruction="hello", history=[], facts={}, side="tailored"
    )

    assert "Not on this CV" in prompt
    assert "links" in prompt


def test_every_line_is_addressable_and_facts_are_marked_read_only() -> None:
    """It needs ids to place an addition, and it must not offer to rewrite an
    employer or a date."""
    document = _document()

    prompt = agent_user(
        document=document, job_text="", instruction="x", history=[], facts={}, side="tailored"
    )

    assert _bullet(document).id in prompt
    assert "read only" in prompt


def test_only_the_recent_conversation_is_carried() -> None:
    """A long conversation crowds out the CV, which is the actual subject."""
    history = [AgentTurn(role="user", content=f"turn {i}") for i in range(30)]

    prompt = agent_user(
        document=_document(),
        job_text="",
        instruction="x",
        history=history,
        facts={},
        side="tailored",
    )

    assert "turn 29" in prompt
    assert "turn 0" not in prompt


# ═══════════════════════════════════════════════════════════════════════════
# The endpoint
# ═══════════════════════════════════════════════════════════════════════════


def test_the_agent_needs_an_account(client) -> None:
    response = client.post(
        "/api/agent/edit",
        json={
            "document": parse_pasted(CV).model_dump(mode="json"),
            "instruction": "make it shorter",
        },
    )

    assert response.status_code in (401, 403)


@pytest.mark.parametrize("instruction", ["", "x" * 3000])
def test_an_unusable_instruction_is_rejected(client, instruction: str) -> None:
    response = client.post(
        "/api/agent/edit",
        json={"document": parse_pasted(CV).model_dump(mode="json"), "instruction": instruction},
    )

    assert response.status_code in (401, 403, 422)


# ═══════════════════════════════════════════════════════════════════════════
# The schema the model is actually given
#
# Every agent turn failed with a 500 before the model was even asked, because
# `learned` was declared as a free-form dict. Pydantic compiles that to
# `additionalProperties`, and the Gemini Developer API refuses a schema
# containing one. The browser reported it as a CORS error — an unhandled 500
# does not carry the headers the application would have added — which is a
# true statement about a response the app never sent and a useless description
# of what went wrong.
#
# So the schema is asserted against the real validator rather than trusted.
# ═══════════════════════════════════════════════════════════════════════════


def test_the_reply_schema_is_one_gemini_will_accept() -> None:
    from aptly.agent.schemas import AgentReply
    from google.genai import Client
    from google.genai import _transformers as transformers

    client = Client(api_key="x" * 20)

    # Raises ValueError naming the offending construct if it will not compile.
    transformers.t_schema(client._api_client, AgentReply)


def test_no_free_form_object_reaches_the_model_schema() -> None:
    """The specific construct, named, so a future `dict[str, …]` fails here
    rather than in production.

    Walked structurally rather than searched as text: the schema carries every
    docstring as a `description`, and the docstring explaining this rule
    contains the word it is looking for.
    """
    from aptly.agent.schemas import AgentReply

    def offenders(node, path="") -> list[str]:
        if isinstance(node, dict):
            found = ["additionalProperties" for key in node if key == "additionalProperties"]
            return [f"{path}: {name}" for name in found] + [
                item
                for key, value in node.items()
                if key != "description"
                for item in offenders(value, f"{path}.{key}")
            ]
        if isinstance(node, list):
            return [item for value in node for item in offenders(value, path)]
        return []

    assert offenders(AgentReply.model_json_schema()) == []


def test_learned_facts_still_arrive_as_a_dictionary() -> None:
    """A list on the way in from the model, a dictionary on the way out to the
    browser — which is what makes a repeated key one fact rather than two."""
    from aptly.agent import _clean_facts
    from aptly.agent.schemas import LearnedFact

    facts = _clean_facts(
        [
            LearnedFact(key="GitHub", value="github.com/amanm"),
            LearnedFact(key="github", value="github.com/amanm"),
            LearnedFact(key="phone", value="+91 98765 43210"),
        ]
    )

    assert facts == {"github": "github.com/amanm", "phone": "+91 98765 43210"}
