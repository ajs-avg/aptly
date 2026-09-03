"""The agent that edits one CV, on request, in plain language.

Somebody looking at a finished CV has opinions that no set of buttons
anticipates — "this is too long", "lead with the deployment thing", "the
summary sounds like everyone else's". Until now the only answers were the
change cards the model happened to produce and a text field per line. This is
the third: say what you want and watch it happen.

── One per document, and they do not read each other ───────────────────────

The tailored CV and the rebuilt one are two different arguments for the same
person, and an agent holding both would spend its time offering to make them
the same. So each agent sees exactly one document, and cannot see the other.

What crosses between them is what the *person* said. Told the left-hand agent a
GitHub link, the right-hand one should not have to be told again — that is a
fact about them, not about a document. It travels in ``facts``, which the
browser holds and hands to both, and which is gone when the tab is. Nothing
here is written to the database: this is a conversation, not a record.

── It proposes; it does not apply ──────────────────────────────────────────

Every edit comes back as a change card — the current line, the proposed line,
and one sentence of reason — and lands in the same review the rest of the
product uses. That is not caution for its own sake. An agent that edits
directly is one whose mistakes are discovered later, in a downloaded file, by
somebody who no longer remembers what the line used to say.

── And it cannot invent ────────────────────────────────────────────────────

"Add the skills from the job post" is the most natural thing in the world to
ask, and doing it is how a CV becomes a document its owner cannot defend in an
interview. Every edit runs through the same no-fabrication check as every other
line in the product. What the agent does instead is *say so*, and say what
would change it: tell me where you used it, and I will add it.
"""

from __future__ import annotations

from aptly.agent.prompts import AGENT_SYSTEM, agent_user
from aptly.agent.schemas import (
    AgentEdit,
    AgentReply,
    AgentRequest,
    AgentResponse,
    AgentTurn,
    LearnedFact,
    Refusal,
    Scale,
)
from aptly.llm.client import GeminiClient, Usage
from aptly.logging import get_logger
from aptly.model.document import CVDocument, normalize_text
from aptly.profile.schemas import CareerProfile
from aptly.validate import SourceMaterial, unsupported_claims

log = get_logger(__name__)

#: Above this many edits, or this much rewritten text, the change is shown in
#: full before it happens rather than landing as a card in the list.
#:
#: The line is drawn where the person's own attention changes. Two lines
#: tightened is something they scan; the summary rewritten and four bullets
#: reordered is something they read, and being asked to read it in a list of
#: change cards is how it gets applied unread.
_LARGE_EDITS = 3
_LARGE_CHARS = 400


async def run_agent(
    request: AgentRequest,
    document: CVDocument,
    *,
    client: GeminiClient,
    profile: CareerProfile | None = None,
) -> tuple[AgentResponse, Usage]:
    """One turn: read the instruction, propose edits, check every one of them."""
    completion = await client.structured(
        model=client.main_model,
        system=AGENT_SYSTEM,
        user=agent_user(
            document=document,
            job_text=request.job_text,
            instruction=request.instruction,
            history=request.history,
            facts=request.facts,
            side=request.side,
            profile=profile,
        ),
        schema=AgentReply,
        # Editing somebody's employment history on request. Low, but not as low
        # as extraction: "make this sound less like everyone else" is a writing
        # task and needs somewhere to go.
        temperature=0.3,
        purpose=f"agent:{request.side}",
    )

    reply = completion.value
    source = SourceMaterial.build(
        document,
        None,
        profile_text=profile.as_source_text() if profile else "",
        # What they said in this conversation is their own words too, and an
        # agent told "my GitHub is github.com/aman" must be able to write it in.
        # Without this the validator rejects the very thing it was just given.
        extra=" ".join(request.facts.values()) + " " + request.instruction,
    )

    kept, refused = _check(reply, document, source)
    facts = {**request.facts, **_clean_facts(reply.learned)}

    log.info(
        "agent.turn",
        side=request.side,
        proposed=len(reply.edits),
        kept=len(kept),
        refused=len(refused),
        questions=len(reply.questions),
        output_tokens=completion.usage.output_tokens,
    )

    return (
        AgentResponse(
            reply=reply.reply,
            edits=kept,
            refused=[*reply.refused, *refused],
            questions=reply.questions[:3],
            learned=reply.learned,
            facts=facts,
            scale=_scale(kept),
        ),
        completion.usage,
    )


def _check(
    reply: AgentReply, document: CVDocument, source: SourceMaterial
) -> tuple[list[AgentEdit], list[Refusal]]:
    """Drop every edit that names something the person never wrote.

    The same test the tailoring and rebuild paths run, applied here for the same
    reason and one more: this is the path somebody will *ask* to have their CV
    stretched on. "Add Kubernetes, they want Kubernetes" is a reasonable thing
    to say and an unreasonable thing to do, and the check is what makes the
    difference between a tool that declines and a tool that obliges.

    A dropped edit becomes a refusal rather than a silence. An agent that says
    "done" and changed nothing is worse than one that says no.
    """
    kept: list[AgentEdit] = []
    refused: list[Refusal] = []

    for edit in reply.edits:
        node = document.node(edit.node_id)

        # A removal and a move both name a line that has to still be there, and
        # a removal has to still say what it says. Deleting by id alone would
        # take out whatever now sits at that id — which, after the person has
        # edited, is not what the agent read.
        if edit.kind in {"replace", "remove", "move"}:
            if node is None:
                refused.append(
                    Refusal(
                        what=f"Rewriting a line ({edit.node_id})",
                        why="That line is not on this CV any more. Ask again and I will look at what is here now.",
                    )
                )
                continue
            # The line moved since the agent read it — an edit applied on top
            # of the person's own would silently overwrite their work.
            if edit.before and normalize_text(node.text) != normalize_text(edit.before):
                refused.append(
                    Refusal(
                        what=f"Changing “{node.text[:60]}”",
                        why="That line changed while I was working on it, so I left it alone.",
                    )
                )
                continue

        # Nothing to check on a removal or a move: neither writes a word. What
        # they do is reversible in one press, which is the guarantee that makes
        # letting the agent do them at all reasonable.
        if edit.kind in {"remove", "move"}:
            kept.append(edit)
            continue

        if problem := unsupported_claims(edit.after, source):
            _, detail = problem
            refused.append(
                Refusal(
                    what=f"“{edit.after[:80]}”",
                    why=(
                        f"{detail} I can only write what you have already told me — "
                        "say where you did it and I will put it in."
                    ),
                )
            )
            continue

        kept.append(edit)

    return kept, refused


def _scale(edits: list[AgentEdit]) -> Scale:
    """Whether this is something to scan or something to read."""
    if len(edits) >= _LARGE_EDITS:
        return "large"
    if sum(len(edit.after) for edit in edits) >= _LARGE_CHARS:
        return "large"
    return "small"


def _clean_facts(learned: list[LearnedFact]) -> dict[str, str]:
    """Keep what the person said, in a shape the other agent can read.

    Arrives as a list because the model's schema cannot hold a free-form object
    (see `LearnedFact`); leaves as a dictionary because that is what the browser
    hands to both agents and what makes a repeated key one fact rather than two.

    Bounded on both sides. A key is a label, not a paragraph, and a fact the
    model decided to record at four hundred characters is a summary of the
    conversation rather than a fact from it.
    """
    out: dict[str, str] = {}
    for fact in learned[:20]:
        name = fact.key.strip().lower()[:40]
        text = fact.value.strip()[:300]
        if name and text:
            out[name] = text
    return out


__all__ = ["AgentRequest", "AgentResponse", "AgentTurn", "run_agent"]
