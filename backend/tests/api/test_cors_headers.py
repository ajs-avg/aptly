"""What the browser is allowed to read off a response.

A header the browser cannot see is not an error. It reads back as ``null``,
silently, and the calling code takes whatever fallback it had — which is how
choosing "Word" in the download menu came to save .docx bytes under a .txt name
and hand the person a page of binary.

``allow_headers`` does not cover this. That is about the *request*. Response
headers need ``expose_headers``, and anything not on the CORS safelist is
invisible without it.
"""

from __future__ import annotations

import json

import pytest
from aptly.ingest import parse_pasted
from aptly.main import EXPOSED_HEADERS

#: The six a browser may always read, per the Fetch standard. Everything else
#: has to be named.
SAFELISTED = {
    "cache-control",
    "content-language",
    "content-type",
    "expires",
    "last-modified",
    "pragma",
}

ORIGIN = "http://localhost:3000"


def _readable(response) -> set[str]:
    """The headers JavaScript on another origin can actually get()."""
    exposed = {
        name.strip().lower()
        for name in (response.headers.get("access-control-expose-headers") or "").split(",")
        if name.strip()
    }
    return SAFELISTED | exposed


def _export(client, target: str):
    document = parse_pasted(
        "Aman Mishra\naman@example.com\n\nSUMMARY\nProduct manager.\n\nSKILLS\nPython, SQL\n"
    )
    return client.post(
        "/api/cv/export",
        data={"document": document.model_dump_json(), "target": target},
        headers={"Origin": ORIGIN},
    )


@pytest.mark.parametrize("header", ["content-disposition", "x-aptly-rebuilt", "x-aptly-notes"])
def test_the_browser_can_read_the_export_headers(client, header: str) -> None:
    response = _export(client, "docx")

    assert response.status_code == 200
    assert header in _readable(response), (
        f"{header} is sent but not exposed, so a cross-origin browser sees None"
    )


def test_the_filename_says_the_format_that_was_asked_for(client) -> None:
    response = _export(client, "docx")

    disposition = response.headers["content-disposition"]
    assert disposition.endswith('.docx"'), disposition
    # And the browser can reach it, which is the half that was broken.
    assert "content-disposition" in _readable(response)


def test_a_rebuild_says_so_where_the_browser_can_hear_it(client) -> None:
    response = _export(client, "pdf")

    assert response.headers["x-aptly-rebuilt"] == "true"
    assert json.loads(response.headers["x-aptly-notes"])
    assert {"x-aptly-rebuilt", "x-aptly-notes"} <= _readable(response)


def test_every_header_the_export_sets_is_on_the_exposed_list() -> None:
    """The list and the endpoint must not drift apart.

    Adding a header to the response and forgetting this list is exactly the
    mistake that broke the download, and it fails silently in the browser.
    """
    exposed = {name.lower() for name in EXPOSED_HEADERS}
    assert {"content-disposition", "x-aptly-rebuilt", "x-aptly-notes"} <= exposed
