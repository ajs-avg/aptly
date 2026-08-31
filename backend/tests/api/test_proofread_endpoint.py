"""The proofreading endpoint.

Separate from the checks themselves so it can use the API client fixture, which
lives beside the other API tests.
"""

from __future__ import annotations

from aptly.ingest import parse_pasted

CLEAN = """Aman Mishra
Bengaluru, India | +91 98765 43210 | aman@example.com

SUMMARY
Product manager with six years across hardware and software launches.

EXPERIENCE
Senior Product Manager, Kalyra - Jan 2021 to Dec 2024
- Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.
- Ran discovery with 40 customers and shipped a pricing change worth 8% ARR.
"""


def test_proofreading_needs_no_account(client) -> None:
    """Deterministic, no model, no cost — so it can run on every edit."""
    document = parse_pasted(CLEAN).model_dump(mode="json")

    response = client.post("/api/cv/proofread", json={"document": document})

    assert response.status_code == 200
    assert response.json()["findings"] == []


def test_the_endpoint_counts_by_severity(client) -> None:
    cv = CLEAN.replace("Jan 2021 to Dec 2024", "Jan 2023 to Dec 2022")
    document = parse_pasted(cv).model_dump(mode="json")

    body = client.post("/api/cv/proofread", json={"document": document}).json()

    assert body["errors"] >= 1
    assert body["findings"][0]["severity"] == "error", "worst first"
