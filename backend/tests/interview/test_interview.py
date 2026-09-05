"""The preparation sheet — pinned where it could quietly go wrong."""

from __future__ import annotations

from aptly.interview import INTERVIEW_SYSTEM, InterviewPrep, interview_user


def test_the_schema_is_one_gemini_will_accept() -> None:
    from google.genai import Client
    from google.genai import _transformers as transformers

    client = Client(api_key="x" * 20)
    transformers.t_schema(client._api_client, InterviewPrep)


def test_the_prompt_carries_the_three_kinds_and_the_rule() -> None:
    for marker in ("requirement", "cv", "gap", "Never script a claim"):
        assert marker in INTERVIEW_SYSTEM


def test_both_documents_reach_the_prompt() -> None:
    prompt = interview_user("We need Kubernetes.", "Cut ramp time from 12 weeks to 6.")

    assert "Kubernetes" in prompt
    assert "12 weeks to 6" in prompt
