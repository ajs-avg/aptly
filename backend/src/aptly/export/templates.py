"""The layouts a CV can be written out in.

A template here is a :class:`StyleProfile` and nothing more, which is the whole
reason this file is short. Every renderer — .docx, .pdf, .tex, text, Markdown —
already reads its page size, margins, three font specs, heading treatment and
body rhythm from that one object, because it was built so a *rebuilt* CV could
look like the CV the person uploaded. Choosing a template is therefore swapping
the profile before rendering, and nothing downstream changes.

── What every template here has in common ──────────────────────────────────

All three are ATS-safe, and that is not a style choice but a floor. An
applicant tracking system reads a document by pulling text out of it in order,
and the things that break it are structural: two columns interleave into
nonsense, a table turns a job history into orphaned cells, a text box is often
skipped outright, and a name in a header can be dropped entirely. So every
template is a single column of ordinary paragraphs, in a font the reader is
certain to have, with real bullet characters and section headings that use the
words a parser is looking for.

Within that floor there is more room than people expect, and it is all
typographic: which typeface, how large the name is, whether a heading is
underlined by a rule, how much air sits between sections. That is what these
three differ on — and it is enough that they read as three different documents
to a human while being the same document to a machine.

── Why three ───────────────────────────────────────────────────────────────

Because the honest answer to "which layout is best" is that it depends on the
industry, and three covers the spread without turning a download into a
shopping trip. A fourth would mostly differ from one of these by a point of
leading.
"""

from __future__ import annotations

from dataclasses import dataclass

from aptly.model.style import FontSpec, Margins, StyleProfile


@dataclass(frozen=True, slots=True)
class Template:
    """One layout, and how to describe it to somebody choosing."""

    key: str
    name: str
    #: One line, in the product's voice. Shown on the card.
    blurb: str
    #: Who it suits. The thing that actually helps somebody decide.
    suits: str
    profile: StyleProfile
    #: A LaTeX writer of its own, for a template whose layout lives in macros
    #: rather than in a style profile. See `latex_format1`.
    tex_renderer: str = "stock"


#: A serif face for the traditional layout.
#:
#: Cambria rather than Times New Roman, which is the reflex: Times at 10.5pt on
#: screen is cramped and dated, and Cambria was drawn for exactly this — a
#: serif that survives being read on a monitor. Both ship with Word, so neither
#: risks the substitution that turns a careful layout into a ragged one.
_SERIF = "Cambria"

#: And a sans for the other two. Calibri is on every Windows machine and every
#: Office install; Helvetica and Arial substitute for it cleanly everywhere
#: else. A font the reader does not have is a font the reader does not see.
_SANS = "Calibri"


FORMAT_1 = Template(
    key="format-1",
    name="Format 1",
    blurb="The LaTeX résumé — small-caps headings under a rule, dates on the right.",
    suits=(
        "Engineering and computer science, and anyone who wants the .tex to take "
        "away and edit. Download it as LaTeX and it compiles on Overleaf as it is."
    ),
    # The .docx and .pdf approximation of its look. What gives this template its
    # identity is macros — a title and a date on one ruled row, small caps under
    # a rule — and none of that is a font size, so a style profile cannot carry
    # it. Those two formats get its typography; the .tex gets both.
    profile=StyleProfile(
        margins=Margins(top_pt=36, bottom_pt=36, left_pt=40, right_pt=40),
        body=FontSpec(family=_SERIF, size_pt=10.0),
        name=FontSpec(family=_SERIF, size_pt=24.0, bold=True),
        section_heading=FontSpec(family=_SERIF, size_pt=12.0, bold=True),
        entry_heading=FontSpec(family=_SERIF, size_pt=11.0, bold=True),
        heading_transform="upper",
        heading_rule=True,
        heading_space_before_pt=10.0,
        heading_space_after_pt=3.0,
        line_spacing=1.05,
        paragraph_space_pt=2.0,
    ),
    tex_renderer="format1",
)

CLASSIC = Template(
    key="classic",
    name="Classic",
    blurb="Serif type, ruled section headings, formal spacing.",
    suits="Banking, law, consulting, academia, government — anywhere the reader expects a document rather than a design.",
    profile=StyleProfile(
        margins=Margins(top_pt=54, bottom_pt=54, left_pt=64, right_pt=64),
        body=FontSpec(family=_SERIF, size_pt=10.5),
        name=FontSpec(family=_SERIF, size_pt=19.0, bold=True),
        section_heading=FontSpec(family=_SERIF, size_pt=11.0, bold=True),
        entry_heading=FontSpec(family=_SERIF, size_pt=10.5, bold=True),
        # Uppercase and a rule beneath. The rule is the one piece of ornament
        # in this template and it earns its place: it gives a skimming eye a
        # place to stop, which is what a formal reader is doing.
        heading_transform="upper",
        heading_rule=True,
        heading_space_before_pt=12.0,
        heading_space_after_pt=5.0,
        line_spacing=1.15,
        paragraph_space_pt=4.0,
    ),
)

MODERN = Template(
    key="modern",
    name="Modern",
    blurb="Clean sans, no rules, a larger name and more air.",
    suits="Technology, product, design, startups — anywhere the CV is skimmed on a screen in under a minute.",
    profile=StyleProfile(
        margins=Margins(top_pt=52, bottom_pt=52, left_pt=58, right_pt=58),
        body=FontSpec(family=_SANS, size_pt=10.5),
        # The name is the one thing that should be unmissable, and this is the
        # template read on a screen where a scroll starts at the top.
        name=FontSpec(family=_SANS, size_pt=22.0, bold=True),
        section_heading=FontSpec(family=_SANS, size_pt=11.0, bold=True),
        entry_heading=FontSpec(family=_SANS, size_pt=10.5, bold=True),
        # No rule. Space does the separating instead, which is what makes this
        # read as current rather than as a form.
        heading_transform="upper",
        heading_rule=False,
        heading_space_before_pt=14.0,
        heading_space_after_pt=4.0,
        line_spacing=1.2,
        paragraph_space_pt=5.0,
    ),
)

COMPACT = Template(
    key="compact",
    name="Compact",
    blurb="Smaller type and tighter rhythm, to fit more on a page.",
    suits="A long history that has to reach one page, or a two-page CV you want to be one.",
    profile=StyleProfile(
        # Narrower margins and a smaller body: together these are worth roughly
        # a third more content per page than Modern, which is the entire point.
        margins=Margins(top_pt=40, bottom_pt=40, left_pt=46, right_pt=46),
        body=FontSpec(family=_SANS, size_pt=9.5),
        name=FontSpec(family=_SANS, size_pt=17.0, bold=True),
        section_heading=FontSpec(family=_SANS, size_pt=10.0, bold=True),
        entry_heading=FontSpec(family=_SANS, size_pt=9.5, bold=True),
        heading_transform="upper",
        heading_rule=True,
        heading_space_before_pt=8.0,
        heading_space_after_pt=3.0,
        # Tight, but not so tight that the lines touch. Below about 1.05 a
        # reader stops skimming and starts working, and a CV that is hard to
        # read has saved a page at the cost of the thing it was for.
        line_spacing=1.08,
        paragraph_space_pt=2.0,
    ),
)


TEMPLATES: dict[str, Template] = {
    template.key: template for template in (FORMAT_1, CLASSIC, MODERN, COMPACT)
}

#: What the UI offers, in the order it offers them.
TEMPLATE_ORDER: tuple[str, ...] = ("format-1", "modern", "classic", "compact")


def get_template(key: str | None) -> Template | None:
    """The template with this key, or None for "keep the document's own"."""
    if not key:
        return None
    return TEMPLATES.get(key)


__all__ = ["TEMPLATES", "TEMPLATE_ORDER", "Template", "get_template"]
