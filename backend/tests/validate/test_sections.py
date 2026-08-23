"""Heading classification.

Heading detection is the load-bearing step of ingest: everything downstream —
which section a line belongs to, whether the tailoring pass may rewrite it,
where a rebuilt CV puts it — follows from getting this right. A false heading is
far more expensive than a missed one, because it splits a document rather than
flattening it.
"""

from __future__ import annotations

import pytest
from aptly.ingest import parse_pasted
from aptly.ingest.sections import classify_heading

# ═══════════════════════════════════════════════════════════════════════════
# A label with its contents is content, not a heading
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    "line",
    [
        "Languages: JavaScript, TypeScript, HTML5, CSS3",
        "Tools: Docker, Git, Jenkins",
        "Technologies: React, Node.js",
        "Certifications: AWS Solutions Architect",
        "Projects: internal dashboard, reporting tool",
    ],
)
def test_a_labelled_list_is_not_a_heading(line: str) -> None:
    """Skill blocks are written exactly this way.

    Classification matches by containment, which cannot tell "Languages:" the
    label from "Languages" the section on its own. Read as a heading, one skills
    line opened a Languages section and swallowed the rest of the CV under it.
    """
    assert classify_heading(line) is None


@pytest.mark.parametrize(
    ("line", "kind"),
    [
        ("EXPERIENCE:", "experience"),
        ("Skills:", "skills"),
        ("LANGUAGES", "languages"),
        ("TECHNICAL SKILLS", "skills"),
        ("Work Experience", "experience"),
        ("INTERNSHIP EXPERIENCE", "experience"),
        ("Academic Qualifications", "education"),
    ],
)
def test_a_bare_label_is_still_a_heading(line: str, kind: str) -> None:
    """A trailing colon ends a heading; it does not disqualify one."""
    assert classify_heading(line) == kind


def test_a_skills_block_stays_one_section() -> None:
    """The whole point, checked on a document rather than on a string.

    Every line after the mislabelled one used to be filed under it, so the
    education section vanished and the skills section lost its contents.
    """
    document = parse_pasted(
        "Priya Raman\npriya@example.com\n\n"
        "TECHNICAL SKILLS\n"
        "Languages: JavaScript, TypeScript, HTML5, CSS3\n"
        "Tools: Docker, Git, Jenkins\n\n"
        "EDUCATION\n"
        "B.E. Computer Science, VTU - 2022\n"
    )

    kinds = [section.kind for section in document.sections]
    assert kinds.count("skills") == 1
    assert "languages" not in kinds
    assert "education" in kinds

    skills = document.section("skills")
    assert skills is not None
    text = " ".join(node.text for node in skills.nodes)
    assert "JavaScript" in text
    assert "Docker" in text
