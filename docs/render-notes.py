"""Render docs/build-notes.typ to a PDF.

Typst rather than an HTML-to-PDF engine for the same reason the CV exporter
uses it: one self-contained wheel, no system libraries. Run from the repo root:

    uv run python docs/render-notes.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import typst

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "build-notes.typ"
OUTPUT = HERE / "Aptly-Build-Notes.pdf"

# macOS keeps its faces in these two places; Typst only bundles a handful of its
# own, so without these the Helvetica stack falls back silently.
FONT_PATHS = [p for p in ("/System/Library/Fonts", "/Library/Fonts") if Path(p).is_dir()]


def main() -> int:
    data = typst.compile(str(SOURCE), font_paths=FONT_PATHS)
    if isinstance(data, list):
        data = data[0]
    OUTPUT.write_bytes(data)
    print(f"{OUTPUT}  ({len(data) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
