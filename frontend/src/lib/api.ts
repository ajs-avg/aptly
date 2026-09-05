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
  AgentResponse,
  AgentTurn,
  AuthSession,
  CareerProfile,
  CoverLetter,
  CvTemplate,
  CVDocument,
  ExtractResponse,
  IngestResponse,
  InterviewPrep,
  JobPost,
  LibraryPage,
  ProfileResponse,
  ProofreadResponse,
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

/**
 * A request that never reached the API.
 *
 * `fetch` rejects with a bare TypeError for a CORS refusal, a DNS failure and
 * an offline browser alike — the response is not readable from script, by
 * design. So this cannot say *which* of those happened, but it can say the one
 * thing that matters: the file was never sent, so nothing about the file is the
 * problem.
 *
 * That distinction was worth building. A misconfigured CORS origin surfaced as
 * "Aptly could not read that — check the file and try again", and the honest
 * answer was that the file had not been read at all.
 */
export class NetworkError extends ApiError {
  constructor() {
    super(
      "Aptly could not reach the server.",
      "Your file never left this browser, so it is not the problem. Check your connection — if it persists, the API is unreachable from here.",
      "unreachable",
    );
    this.name = "NetworkError";
  }
}

/** Run a fetch, turning a transport failure into something sayable. */
async function call(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // An aborted request is the person navigating away, not a failure.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NetworkError();
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
  const response = await call(`${API}/api/cv/ingest`, {
    method: "POST",
    body,
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function ingestPaste(text: string): Promise<IngestResponse> {
  const response = await call(`${API}/api/cv/paste`, {
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
  /**
   * Set the CV in one of Aptly's layouts instead of the person's own.
   *
   * Mutually exclusive with keeping their formatting, and deliberately so: a
   * template is them setting their own file aside on purpose, which is a
   * different thing from us setting it aside for them.
   */
  template?: string,
): Promise<ExportResult> {
  const body = new FormData();
  body.append("document", JSON.stringify(document));
  if (original) body.append("file", original);
  if (target) body.append("target", target);
  if (template) body.append("template", template);

  const response = await call(`${API}/api/cv/export`, {
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
    filename: match?.[1] ?? downloadName(document, target),
    rebuilt: response.headers.get("X-Aptly-Rebuilt") === "true",
    notes,
  };
}

/**
 * What to call the file when the server's own answer did not arrive.
 *
 * It does arrive, now. `Content-Disposition` is not a CORS-safelisted response
 * header, so until the API listed it in `expose_headers` this read back as
 * `null` on every cross-origin deployment — silently, because a header the
 * browser is not allowed to see is not an error, it is simply absent.
 *
 * The old fallback was `document.source_filename`, which is the name of the CV
 * that came *in*. So choosing Word wrote .docx bytes to a file called `.txt`,
 * and opening it showed a page of binary. The extension has to come from the
 * format that was actually asked for; that is the one thing this side always
 * knows for certain.
 *
 * Kept even though the header now works: a filename is decided here or it is
 * decided by a proxy that stripped a header, and only one of those is us.
 */
function downloadName(document: CVDocument, target?: TargetFormat): string {
  const extension = target ?? document.source_format;

  const base = document.source_filename.split("/").pop() ?? "";
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;

  // "pasted" is what the parser calls text typed into a box. It is a note about
  // how the CV got here, not a name, and it should never reach a downloads
  // folder — see `_stem` in the API's export module, which agrees.
  if (stem && stem !== "pasted") return `${stem}.${extension}`;

  const who = (document.contact.name ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "-");
  const date = new Date().toISOString().slice(0, 10);
  return `${who.replace(/^-+|-+$/g, "") || "Aptly-Resume"}-${date}.${extension}`;
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
  const response = await call(`${API}/api/tailor`, {
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

export interface Rescore {
  score: number;
  essential_met: number;
  essential_total: number;
  fit: string;
  gaps: { requirement: string; essential: boolean; status: string }[];
}

/**
 * Score the edited document for real.
 *
 * The live figure moves only on requirements the post *names* — that is all the
 * browser can settle without a model. Tailoring mostly does something else, so
 * somebody can apply six changes and watch the number sit still. This asks the
 * server to read the document again properly, capability judgements included.
 *
 * A model call, so it runs when somebody asks rather than as they type.
 */
export async function rescore(document: CVDocument, jobText: string): Promise<Rescore> {
  const response = await call(`${API}/api/rescore`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({ document, job_text: jobText }),
  });
  if (!response.ok) await fail(response);
  return response.json();
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
 *
 * **Pass a content type in here, never beside the spread.** `headers` written
 * after `...(await authed())` replaces the Headers object this builds rather
 * than adding to it, and takes the bearer token with it. Five call sites did
 * exactly that, so every authenticated POST reached the API anonymously —
 * invisible on a cookie deployment, and a flat refusal on a Supabase one.
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
  /** What the document scored when it was approved. */
  score?: number | null;
}

export async function saveRecord(
  input: SaveRecordInput,
): Promise<RecordDetail> {
  const response = await call(`${API}/api/records`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({
      job_text: input.jobText,
      job: input.job ?? null,
      filename: input.filename,
      source_format: input.sourceFormat,
      content_hash: input.contentHash,
      doc_model: input.document,
      change_log: input.changeLog,
      source_url: input.sourceUrl ?? null,
      score: input.score ?? null,
    }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

/**
 * One cover letter for one job, streamed for the reason the agent is: a
 * model call is a long silence, and a connection that sits silent is not
 * reliably one that finishes. Same frames — `working` held open, the answer
 * last, errors as events.
 */
export async function writeCoverLetter(input: {
  document: CVDocument;
  jobText: string;
}): Promise<CoverLetter> {
  const response = await call(`${API}/api/cover-letter`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({ document: input.document, job_text: input.jobText }),
  });
  if (!response.ok) await fail(response);
  if (!response.body) throw new ApiError("The letter did not start.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer: CoverLetter | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // CRLF normalised first — the server separates frames with "\r\n\r\n",
      // in which a search for "\n\n" finds nothing at all.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        const payload = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        if (event.kind === "working") continue;
        if (event.kind === "error") {
          throw new ApiError(
            String(event.message ?? "Aptly could not finish the letter."),
            String(event.hint ?? ""),
          );
        }
        answer = event as unknown as CoverLetter;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!answer) {
    throw new ApiError(
      "The letter stopped before it finished.",
      "Try again in a moment.",
    );
  }
  return answer;
}

/** The interview preparation sheet for one saved application, streamed. */
export async function interviewPrep(recordId: string): Promise<InterviewPrep> {
  const response = await call(`${API}/api/records/${recordId}/interview`, {
    ...(await authed()),
    method: "POST",
  });
  if (!response.ok) await fail(response);
  if (!response.body) throw new ApiError("The preparation did not start.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer: InterviewPrep | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        const payload = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        if (event.kind === "working") continue;
        if (event.kind === "error") {
          throw new ApiError(
            String(event.message ?? "Aptly could not finish the preparation sheet."),
            String(event.hint ?? ""),
          );
        }
        answer = event as unknown as InterviewPrep;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!answer) {
    throw new ApiError("The preparation stopped before it finished.", "Try again in a moment.");
  }
  return answer;
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
  const response = await call(`${API}/api/records${suffix}`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

export async function getRecord(id: string): Promise<RecordDetail> {
  const response = await call(`${API}/api/records/${id}`, await authed());
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
  const response = await call(`${API}/api/records/${id}`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function deleteRecord(id: string): Promise<void> {
  const response = await call(`${API}/api/records/${id}`, {
    ...(await authed()),
    method: "DELETE",
  });
  if (!response.ok) await fail(response);
}

// ── auth ──────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<AuthSession> {
  const response = await call(`${API}/api/auth/sign-in`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  const response = await call(`${API}/api/auth/sign-up`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

/**
 * Set a new password without proving the address, and sign in with it.
 *
 * The server decides whether this is allowed — see `direct_reset` on the
 * session — and refuses in production, where the emailed link is the only way.
 */
export async function resetPassword(
  email: string,
  password: string,
): Promise<AuthSession> {
  const response = await call(`${API}/api/auth/reset-password`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function signOut(): Promise<AuthSession> {
  const response = await call(`${API}/api/auth/sign-out`, {
    ...(await authed()),
    method: "POST",
  });
  if (!response.ok) await fail(response);
  return response.json();
}

export async function getSession(): Promise<AuthSession> {
  const response = await call(`${API}/api/auth/session`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

// ── health ────────────────────────────────────────────────────────────────

export async function ready(): Promise<{ ready: boolean; missing: string[] }> {
  const response = await call(`${API}/ready`);
  if (!response.ok) await fail(response);
  return response.json();
}

// ── career profile ────────────────────────────────────────────────────────

export async function getProfile(): Promise<ProfileResponse> {
  const response = await call(`${API}/api/profile`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

export async function saveProfile(profile: CareerProfile): Promise<ProfileResponse> {
  const response = await call(`${API}/api/profile`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "PUT",
    body: JSON.stringify(profile),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

/**
 * Read a CV into the profile, without saving it.
 *
 * The response is a proposal, not a write. The person sees what was read, fixes
 * what the model got wrong, and saves with `saveProfile` — an extraction that
 * saved itself would put a model's reading of a PDF into somebody's career
 * history with nobody having looked at it.
 */
export async function extractProfile(
  document: CVDocument,
  mode: "merge" | "replace" = "merge",
): Promise<ExtractResponse> {
  const response = await call(`${API}/api/profile/extract`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({ document, mode }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

/**
 * The saved profile, rendered as a CV the tailoring pass can read.
 *
 * What makes keeping the profile up to date worth doing: somebody who has
 * filled it in never has to find a resume file again, because the thing Aptly
 * already knows *is* a CV it can tailor.
 */
export async function profileAsCv(): Promise<{ document: CVDocument; usable: boolean }> {
  const response = await call(`${API}/api/profile/as-cv`, await authed());
  if (!response.ok) await fail(response);
  return response.json();
}

/**
 * Check a CV for mechanical mistakes.
 *
 * No account and no rate limit: every check on the other side is deterministic
 * and costs nothing, so this can run whenever the document changes.
 */
export async function proofreadCv(document: CVDocument): Promise<ProofreadResponse> {
  const response = await call(`${API}/api/cv/proofread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });
  if (!response.ok) await fail(response);
  return response.json();
}

/** The layouts a CV can be set in. */
export async function getTemplates(): Promise<CvTemplate[]> {
  const response = await call(`${API}/api/cv/templates`);
  if (!response.ok) await fail(response);
  return response.json();
}

/**
 * One turn with the agent for one CV.
 *
 * Stateless on the server: the conversation and everything said during it go
 * up with each message and come back down. That is what makes "session only,
 * nothing stored" true rather than merely intended — and it is how the two
 * agents share what somebody told either of them without either being able to
 * read the other's document.
 */
export async function askAgent(input: {
  document: CVDocument;
  jobText: string;
  instruction: string;
  history: AgentTurn[];
  facts: Record<string, string>;
  side: "tailored" | "rebuilt";
}): Promise<AgentResponse> {
  const response = await call(`${API}/api/agent/edit`, {
    ...(await authed({ headers: { "Content-Type": "application/json" } })),
    method: "POST",
    body: JSON.stringify({
      document: input.document,
      job_text: input.jobText,
      instruction: input.instruction,
      history: input.history,
      facts: input.facts,
      side: input.side,
    }),
  });
  if (!response.ok) await fail(response);
  if (!response.body) throw new ApiError("The agent did not answer.");

  /*
   * Read as a stream, for the reason the endpoint is one.
   *
   * The agent thinks for as long as the model takes — twenty to sixty seconds
   * on a real CV — and a request that sits silent that long is not reliably a
   * request that finishes. A proxy in between sees an idle connection and
   * closes it, and the page it substitutes carries none of the API's CORS
   * headers, so the browser reports "no Access-Control-Allow-Origin": a true
   * statement about a response the application never sent, and a completely
   * misleading description of what went wrong.
   *
   * The first event arrives immediately and holds the connection; the answer
   * is the last one.
   */
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer: AgentResponse | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // CRLF normalised before anything else, for the reason documented on the
      // tailoring reader above: the server separates frames with "\r\n\r\n",
      // in which a search for "\n\n" finds nothing — every event arrives,
      // none parses, and the turn reports itself cut off.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      // SSE frames are separated by a blank line; a frame's payload is its
      // `data:` lines joined.
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        const payload = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        if (event.kind === "working") continue;
        if (event.kind === "error") {
          throw new ApiError(
            String(event.message ?? "The agent could not finish that."),
            String(event.hint ?? ""),
          );
        }
        answer = event as unknown as AgentResponse;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!answer) {
    // The stream opened and closed without an answer, which is what a
    // connection cut mid-thought looks like from here.
    throw new ApiError(
      "The agent stopped before it finished.",
      "Ask again — a shorter instruction is more likely to get through.",
    );
  }
  return answer;
}
