# Aptly

Tailor every application. Be ready when they call.

Drop a job post and your CV, get the exact changes with one-tap apply, and keep a
living record of every application — so the moment a recruiter calls, you are
already prepared.

## Layout

```
aptly/
├── backend/          FastAPI — parsing, tailoring, validation
│   ├── src/aptly/
│   │   ├── ingest/     read .docx / .pdf / .tex / .txt into one model
│   │   ├── model/      the canonical CV document + source anchors
│   │   ├── export/     write it back out in the format it arrived in
│   │   ├── llm/        Gemini client, prompts, tailoring run
│   │   ├── validate/   the no-fabrication checks
│   │   └── api/        HTTP endpoints
│   └── tests/
├── frontend/         Next.js — landing page and the Tailor screen
│   └── src/
│       ├── app/         routes
│       ├── components/  change cards, CV preview, coverage meter
│       └── lib/         API client, document edits, design tokens
├── docs/             product design doc, and a demo CV/job pair
├── pyproject.toml    uv workspace root
└── .env              your keys (never committed)
```

## Running it

Two terminals.

```bash
# backend — http://localhost:8000
uv sync
uv run uvicorn aptly.main:app --reload --port 8000
```

```bash
# frontend — http://localhost:3000
cd frontend && npm install && npm run dev
```

Then open <http://localhost:3000>.

`GET /ready` reports what is configured and what is missing.

## Configuration

Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.

It must be a **billing-enabled** key. Google's free tier states that submitted
data is used for training, and the input here is people's CVs — names,
addresses, employment history.

## Tests

```bash
uv run pytest                              # everything offline
uv run pytest backend/tests/eval -v        # adds live Gemini calls, needs the key
```

The live suite is skipped automatically when no key is set.

## Where the interesting parts are

| Question | File |
|---|---|
| How is a CV represented so one-tap Apply works? | `backend/src/aptly/model/document.py` |
| How does an edit get back into the user's own .docx? | `backend/src/aptly/export/runs.py` |
| How is "no fabrication" actually enforced? | `backend/src/aptly/validate/__init__.py` |
| What is the model told? | `backend/src/aptly/llm/prompts.py` |
| Why does a PDF come back rebuilt rather than edited? | `backend/src/aptly/ingest/pdf.py` |

## Debugging a tailoring run

The API logs one line per section and one per discarded suggestion:

```bash
grep -E "tailor.section|tailor.rejected" /tmp/aptly-api.log | tail -20
```

`tailor.section` reports how many suggestions each section returned, including
zero — the difference between "the model had nothing to say" and "that section
was never asked".
