"""CV ingest and export.

Note what these endpoints do *not* do: store anything. An anonymous visitor can
tailor a CV end to end without a single byte of theirs being written to our
disk. The browser holds the original file and sends it back when it wants a
download, so "first win before first signup" costs the user no privacy at all.

That changes when they choose to save an application record — at which point
they have an account and have asked us to keep it.
"""

from __future__ import annotations

import json
from dataclasses import asdict

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from aptly.config import get_settings
from aptly.errors import FileTooLargeError, ParseError, UnsupportedFormatError
from aptly.export import TARGET_FORMATS, export_cv
from aptly.ingest import SUPPORTED_EXTENSIONS, parse_cv, parse_pasted
from aptly.model.document import CVDocument
from aptly.validate.proofread import proofread

router = APIRouter(prefix="/api/cv", tags=["cv"])


class PasteRequest(BaseModel):
    text: str = Field(min_length=1)


class IngestResponse(BaseModel):
    document: CVDocument
    #: Surfaced verbatim in the UI. A PDF that had to be rebuilt, a two-column
    #: layout an ATS may misread — the person hears about it on upload, not
    #: after they have sent the application.
    warnings: list[str] = Field(default_factory=list)
    supported_formats: list[str] = Field(default_factory=lambda: sorted(SUPPORTED_EXTENSIONS))
    #: What this CV can be downloaded as, whatever it arrived as. Sent with the
    #: parse so the download menu is populated before anyone opens it.
    download_formats: list[str] = Field(default_factory=lambda: list(TARGET_FORMATS))


@router.post("/ingest", response_model=IngestResponse)
async def ingest(file: UploadFile = File(...)) -> IngestResponse:
    """Parse an uploaded CV into the canonical model."""
    settings = get_settings()
    data = await file.read()

    if len(data) > settings.max_upload_bytes:
        raise FileTooLargeError(
            f"That file is {len(data) / 1_048_576:.1f} MB.",
            hint=f"Aptly accepts files up to {settings.max_upload_mb} MB. "
            "A CV this large usually has images in it — try exporting a text-only version.",
        )
    if not data:
        raise ParseError("That file is empty.", hint="Choose a different file, or paste your CV.")

    document = parse_cv(data, file.filename or "cv")
    return IngestResponse(document=document, warnings=document.warnings)


@router.post("/paste", response_model=IngestResponse)
async def paste(payload: PasteRequest) -> IngestResponse:
    """Parse a CV the person pasted rather than uploaded."""
    document = parse_pasted(payload.text)
    return IngestResponse(document=document, warnings=document.warnings)


class ProofreadRequest(BaseModel):
    document: CVDocument


class ProofreadFinding(BaseModel):
    severity: str
    kind: str
    message: str
    hint: str
    node_id: str | None = None
    quote: str = ""


class ProofreadResponse(BaseModel):
    """Everything mechanically wrong with this CV, worst first."""

    findings: list[ProofreadFinding] = Field(default_factory=list)
    #: Counted per severity so the UI can say "2 to fix" without re-tallying.
    errors: int = 0
    warnings: int = 0
    polish: int = 0


@router.post("/proofread", response_model=ProofreadResponse)
async def proofread_cv(payload: ProofreadRequest) -> ProofreadResponse:
    """Check a CV for the mistakes a person is embarrassed to have sent.

    No model, no account, no rate limit — every check is deterministic and runs
    in about a millisecond, so this can be called on every edit without costing
    anything or being able to invent a problem that is not there.
    """
    findings = proofread(payload.document)
    return ProofreadResponse(
        # `asdict`, not `vars`: the finding is a slots dataclass and has no
        # `__dict__` to read.
        findings=[ProofreadFinding(**asdict(finding)) for finding in findings],
        errors=sum(1 for f in findings if f.severity == "error"),
        warnings=sum(1 for f in findings if f.severity == "warning"),
        polish=sum(1 for f in findings if f.severity == "polish"),
    )


@router.post("/export")
async def export(
    request: Request,
    document: str = Form(..., description="The edited CVDocument, as JSON."),
    file: UploadFile | None = File(
        default=None, description="The original file, when there was one."
    ),
    target: str | None = Form(
        default=None,
        description="Download as this format instead. Omit to keep the original's.",
    ),
) -> Response:
    """Write the edited CV back out.

    Without ``target`` this is an edit: the person's own file with only the
    changed lines rewritten, byte-identical when nothing changed. With a
    different ``target`` it is a rebuild in that format — which is how somebody
    who uploaded a .docx gets the PDF an application form is asking for without
    opening Word. The response says which happened, and the UI says so too.

    The original bytes come back from the browser rather than from a server-side
    cache — no session state, nothing stored, and the export works just as well
    for someone who has never signed in.
    """
    try:
        parsed = CVDocument.model_validate_json(document)
    except ValueError as exc:
        raise ParseError(
            "Aptly could not read the edited CV.",
            hint="Reload the page and try again.",
        ) from exc

    if target and target not in TARGET_FORMATS:
        raise UnsupportedFormatError(
            f"Aptly cannot write {target} files.",
            hint=f"Choose one of: {', '.join(TARGET_FORMATS)}.",
        )

    original = await file.read() if file is not None else b""
    result = export_cv(original, parsed, target)

    headers = {
        "Content-Disposition": f'attachment; filename="{result.filename}"',
        "X-Aptly-Rebuilt": "true" if result.rebuilt else "false",
    }
    if result.notes:
        headers["X-Aptly-Notes"] = json.dumps(list(result.notes))

    return Response(content=result.data, media_type=result.media_type, headers=headers)
