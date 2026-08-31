"""What the CV agent is asked, and what it may answer with.

One agent per document, and they are separate on purpose: the tailored CV and
the rebuilt one are two different arguments for the same person, and an agent
holding both would keep offering to make them the same.

What the two *do* share is what the person says while talking to either — see
``facts``. That is a different thing from sharing a document.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

#: How much of the CV one instruction touched.
#:
#: The distinction is the person's, not ours: a typo fixed in place can land
#: like every other change card, and a rewritten summary is something they want
#: to read in full before it happens.
Scale = Literal["small", "large"]

#: Whether an edit replaces a line or introduces one.
#:
#: Worth telling apart on screen. Replacing is reversible by putting the old
#: text back, and the old text is right there to compare against. An addition
#: has nothing to compare against, and it is the operation that can quietly
#: grow a CV past the page it has to fit on.
EditKind = Literal["replace", "add"]


class AgentEdit(BaseModel):
    """One change the agent proposes. Never applied without being shown."""

    node_id: str = Field(
        description=(
            "The id of the line to change. For an addition, the id of the line "
            "the new one should follow, or the section id to append to."
        )
    )
    kind: EditKind = "replace"
    before: str = Field(
        default="",
        description="The line's current text, quoted exactly. Empty for an addition.",
    )
    after: str = Field(description="The new text.")
    reason: str = Field(
        description="One plain sentence: why this helps for THIS job. No praise, no filler."
    )
    drawn_from: str = Field(
        default="",
        description=(
            "The sentence in their CV, profile, or in what they just told you "
            "that this is based on — quoted. A line you cannot quote a source "
            "for is one you must not write."
        ),
    )


class Refusal(BaseModel):
    """Something asked for that the agent will not do, and why."""

    what: str = Field(description="What was asked, in their words where possible.")
    why: str = Field(
        description=(
            "The reason, plainly. If it is because there is no evidence, say what "
            "would change that — 'tell me where you used it and I will add it'."
        )
    )


class AgentReply(BaseModel):
    """One turn of the conversation."""

    reply: str = Field(
        description=(
            "What you did, in one or two sentences, addressed to them. If you "
            "changed nothing, this says why. Never restate the edits line by "
            "line — they are shown."
        )
    )
    edits: list[AgentEdit] = Field(default_factory=list)
    refused: list[Refusal] = Field(default_factory=list)
    questions: list[str] = Field(
        default_factory=list,
        description=(
            "Details that would let you do more — a missing GitHub link, a number "
            "for an achievement that has none. At most three, and only ones that "
            "would genuinely change the CV. Never ask for something already here."
        ),
    )
    learned: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Facts they told you in this message that are worth remembering — "
            "'github: github.com/aman-spp', 'phone: +91…'. Keys are short and "
            "lowercase. Only what they actually said."
        ),
    )


class AgentTurn(BaseModel):
    """One message in the conversation so far."""

    role: Literal["user", "agent"]
    content: str


class AgentRequest(BaseModel):
    """A message to one document's agent."""

    document: object = Field(description="The CVDocument as it currently stands.")
    job_text: str = ""
    instruction: str = Field(min_length=1, max_length=2000)
    history: list[AgentTurn] = Field(default_factory=list)
    #: What the person has told *either* agent this session.
    #:
    #: Passed in and returned rather than stored, because it is theirs and it is
    #: about this sitting. The browser holds it and hands the same object to both
    #: agents, which is what lets the right-hand one know the GitHub link the
    #: left-hand one was given — without either agent reading the other's
    #: document, and without any of it reaching the database.
    facts: dict[str, str] = Field(default_factory=dict)
    #: Which document this is, so the agent can say so. It never sees the other.
    side: Literal["tailored", "rebuilt"] = "tailored"


class AgentResponse(AgentReply):
    """The reply, plus what the screen needs to present it."""

    scale: Scale = "small"
    #: Everything the person has told an agent this session, including whatever
    #: this turn added. The browser holds it and gives it to both.
    facts: dict[str, str] = Field(default_factory=dict)
    remaining_today: int = 0


__all__ = [
    "AgentEdit",
    "AgentReply",
    "AgentRequest",
    "AgentResponse",
    "AgentTurn",
    "EditKind",
    "Refusal",
    "Scale",
]
