/**
 * Talking to the Aptly API.
 *
 * The tailoring endpoint streams, and it has to be a POST (the CV is too large
 * for a URL), which rules out `EventSource` — that only does GET. So the stream
 * is read straight off the `fetch` body and split on the SSE framing by hand.
 * It is a dozen lines and it means change cards appear as they are produced.
 */

import { accessToken } from "./supabase";
import type {
  AuthSession,
  CVDocument,
  IngestResponse,
  JobPost,
  LibraryPage,
  RecordDetail,
  TailorEvent,
  TailorMode,
  TargetFormat,
} from "./types";

/**
 * Where the API lives.
 *
 * A bare hostname is accepted and given a scheme. Render's blueprint can wire
 * one service's address into another's build, but it supplies
 * `aptly-api.onrender.com` with no `https://` — and a fetch to that is resolved
 * as a *relative path*, so every call quietly goes to the web app instead of
 * the API and comes back as HTML.
 */
function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) return "http://localhost:8000";
  if (configured.includes("://")) return configured.replace(/\/$/, "");
  const local = configured.startsWith("localhost") || configured.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${configured.replace(/\/$/, "")}`;
}

const API = apiBase();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly hint: string = "",
    readonly code: string = "error",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fail(response: Response): Promise<never> {
  let message = `Request failed (${response.status}).`;
  let hint = "";
  let code = "error";
  try {
    const body = await response.json();
    if (body?.error) {
      message = body.error.message ?? message;
      hint = body.error.hint ?? "";
      code = body.error.code ?? code;
    }
  } catch {
    // A non-JSON error body is not worth a second failure.
  }
  throw new ApiError(message, hint, code);
}

// ── ingest ────────────────────────────────────────────────────────────────

export async function ingestFile(file: File): Promise<IngestResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API}/api/cv/ingest`, {
    method: "POST",
    body,
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function ingestPaste(text: string): Promise<IngestResponse> {
  const response = await fetch(`${API}/api/cv/paste`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

// ── export ────────────────────────────────────────────────────────────────

export interface ExportResult {
  blob: Blob;
  filename: string;
  rebuilt: boolean;
  notes: string[];
}

/**
 * The original file goes back up with the edited document.
 *
 * Nothing of the user's is held server-side while they are anonymous, so the
 * browser is the only place the original bytes exist — which is exactly the
 * privacy posture the product promises.
 */
export async function exportCv(
  document: CVDocument,
  original: File | null,
  /**
   * Download as this format instead of the one it arrived in. Omitted, the
   * export is an *edit* of the person's own file and their formatting survives;
   * given, it is a rebuild in the chosen format — which is how somebody who
   * uploaded a .docx gets the PDF an application form is asking for.
   */
  target?: TargetFormat,
): Promise<ExportResult> {
  const body = new FormData();
  body.append("document", JSON.stringify(document));
  if (original) body.append("file", original);
  if (target) body.append("target", target);

  const response = await fetch(`${API}/api/cv/export`, {
    method: "POST",
    body,
  });
  if (!response.ok) await fail(response);

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  let notes: string[] = [];
  try {
    notes = JSON.parse(response.headers.get("X-Aptly-Notes") ?? "[]");
  } catch {
    notes = [];
  }

  return {
    blob: await response.blob(),
    filename: match?.[1] ?? document.source_filename,
    rebuilt: response.headers.get("X-Aptly-Rebuilt") === "true",
    notes,
  };
}

// ── tailor (streaming) ────────────────────────────────────────────────────

export interface TailorInput {
  document: CVDocument;
  jobText: string;
  stories?: Record<string, string>;
  /**
   * `suggest` edits lines and moves nothing. `redesign` also restructures.
   * `both` returns two finished CVs from one reading of the job — the two
   * slowest calls in the product run once instead of twice.
   */
  mode?: TailorMode;
  signal?: AbortSignal;
}

export async function* streamTailor(
  input: TailorInput,
): AsyncGenerator<TailorEvent> {
  const response = await fetch(`${API}/api/tailor`, {
    // Tailoring reads the signed-in person's career profile as source material,
    // so an unauthenticated call here silently produces a thinner rebuild.
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    signal: input.signal,
    body: JSON.stringify({
      document: input.document,
      job_text: input.jobText,
      stories: input.stories ?? {},
      mode: input.mode ?? "suggest",
    }),
  });

  if (!response.ok) await fail(response);
  if (!response.body) throw new ApiError("The tailoring stream did not open.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Normalise line endings before looking for frame boundaries. The server
      // emits CRLF — the SSE spec's canonical form, and what sse-starlette
      // sends — so a naive search for "\n\n" finds nothing at all in
      // "\r\n\r\n", because a "\r" sits between the two newlines.
      //
      // The failure was silent and total: every event arrived, none was
      // parsed, and the page concluded there was nothing to suggest.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let split: number;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }

    // A final frame with no trailing blank line still counts.
    const trailing = parseFrame(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.cancel().catch(() => {});
  }
}

function parseFrame(frame: string): TailorEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data) return null;
  try {
    return JSON.parse(data) as TailorEvent;
  } catch {
    return null;
  }
}

// ── library ───────────────────────────────────────────────────────────────

/**
 * How a request says who it is from.
 *
 * Two mechanisms, both needed, for two different people:
 *
 * - **Cookies**, always. The anonymous session lives in one, and that visitor
 *   is the person this product is designed around — they tailor a CV before
 *   being asked for anything. Omit this and every request looks like a
 *   brand-new visitor with an empty Library.
 * - **A bearer token**, when Supabase is configured and somebody is signed in.
 *   The API verifies the JWT and maps it to their profile.
 *
 * The token is read per request rather than captured once. Supabase rotates the
 * access token roughly hourly, and a stale one is rejected — which would show
 * up as the Library quietly going empty rather than as a prompt to sign in.
 */
async function authed(init: RequestInit = {}): Promise<RequestInit> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...init, credentials: "include", headers };
}

export interface SaveRecordInput {
  jobText: string;
  job?: JobPost | null;
  filename: string;
  sourceFormat: string;
  contentHash: string;
  document: CVDocument;
  changeLog: Array<Record<string, unknown>>;
  sourceUrl?: string | null;
}

export async function saveRecord(
  input: SaveRecordInput,
): Promise<RecordDetail> {
  const response = await fetch(`${API}/api/records`, {
    ...(await authed()),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_text: input.jobText,
      job: input.job ?? null,
      filename: input.filename,
      source_format: input.sourceFormat,
      content_hash: input.contentHash,
      doc_model: input.document,
      change_log: input.changeLog,
      source_url: input.sourceUrl ?? null,
    }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function listRecords(
  params: {
    q?: string;
    status?: string;
  } = {},
): Promise<LibraryPage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);

  const suffix = search.toString() ? `?${search}` : "";
  const response = await fetch(`${API}/api/records${suffix}`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

export async function getRecord(id: string): Promise<RecordDetail> {
  const response = await fetch(`${API}/api/records/${id}`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

export async function updateRecord(
  id: string,
  patch: Partial<{
    status: string;
    notes: string;
    company: string;
    role: string;
  }>,
): Promise<RecordDetail> {
  const response = await fetch(`${API}/api/records/${id}`, {
    ...(await authed()),
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function deleteRecord(id: string): Promise<void> {
  const response = await fetch(`${API}/api/records/${id}`, {
    ...(await authed()),
    method: "DELETE",
  });
  if (!response.ok) await fail(response);
}

// ── auth ──────────────────────────────────────────────────────────────────

export async function signIn(email: string): Promise<AuthSession> {
  const response = await fetch(`${API}/api/auth/sign-in`, {
    ...(await authed()),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function signOut(): Promise<AuthSession> {
  const response = await fetch(`${API}/api/auth/sign-out`, {
    ...(await authed()),
    method: "POST",
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function getSession(): Promise<AuthSession> {
  const response = await fetch(`${API}/api/auth/session`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

// ── health ────────────────────────────────────────────────────────────────

export async function ready(): Promise<{ ready: boolean; missing: string[] }> {
  const response = await fetch(`${API}/ready`);
  if (!response.ok) await fail(response);
  return response.json();
}
