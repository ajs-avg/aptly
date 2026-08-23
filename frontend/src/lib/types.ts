/**
 * The shapes the API returns.
 *
 * Mirrors the Pydantic models in `apps/api/src/aptly/model` and
 * `apps/api/src/aptly/llm/schemas.py`. Kept hand-written rather than generated:
 * the surface is small, and a hand-written type can carry the reasoning that
 * matters — which is mostly *what must never be edited*.
 */

export type SourceFormat = "docx" | "pdf" | "tex" | "txt" | "md";

/** What a CV can be downloaded as, whatever it arrived as. */
export type TargetFormat = "docx" | "pdf" | "tex" | "md" | "txt";

export type TailorMode = "suggest" | "redesign" | "both";

export type SectionKind =
  | "header"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "publications"
  | "awards"
  | "languages"
  | "volunteering"
  | "interests"
  | "custom";

export type NodeRole =
  | "name"
  | "contact"
  | "summary"
  | "section_title"
  | "entry_role"
  | "entry_org"
  | "entry_meta"
  | "bullet"
  | "skill_line"
  | "freeform";

/**
 * Roles the tailoring pass may rewrite. Everything else — names, employers,
 * job titles, dates — is a fact about the person, and the UI must never offer
 * to change it. Mirrors EDITABLE_ROLES on the server.
 */
export const EDITABLE_ROLES: ReadonlySet<NodeRole> = new Set([
  "summary",
  "bullet",
  "skill_line",
  "freeform",
]);

export interface TextNode {
  id: string;
  role: NodeRole;
  text: string;
  anchor: { kind: string; [key: string]: unknown };
}

export interface Entry {
  id: string;
  role: string | null;
  org: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  heading_nodes: TextNode[];
  bullets: TextNode[];
}

export interface Section {
  id: string;
  kind: SectionKind;
  title: string | null;
  title_node: TextNode | null;
  entries: Entry[];
  loose_nodes: TextNode[];
}

export interface ContactBlock {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
}

export interface CVDocument {
  doc_id: string;
  source_format: SourceFormat;
  source_filename: string;
  content_hash: string;
  style_profile: Record<string, unknown>;
  contact: ContactBlock;
  sections: Section[];
  warnings: string[];
}

export interface IngestResponse {
  document: CVDocument;
  warnings: string[];
  supported_formats: string[];
}

// ── Job post ──────────────────────────────────────────────────────────────

export interface Requirement {
  text: string;
  keywords: string[];
  essential: boolean;
}

export interface JobPost {
  company: string | null;
  role: string | null;
  location: string | null;
  seniority: string | null;
  employment_type: string | null;
  salary_text: string | null;
  requirements: Requirement[];
  responsibilities: string[];
  keywords: string[];
}

// ── Suggestions ───────────────────────────────────────────────────────────

export interface Provenance {
  kind: "cv_node" | "story_item";
  source_id: string;
  quote: string;
}

export interface Suggestion {
  node_id: string;
  before: string;
  after: string;
  reason: string;
  provenance: Provenance;
  confidence: "high" | "medium" | "low";
  requires_confirmation: boolean;
}

export type FlagKind =
  | "confirm_wording"
  | "borrowed_term"
  | "much_longer"
  | "low_confidence"
  | "dropped_detail"
  | "less_specific";

export interface Flag {
  kind: FlagKind;
  detail: string;
}

export interface KeywordMatch {
  keyword: string;
  covered: boolean;
  evidence_node_id: string | null;
  evidence_quote: string | null;
}

export interface Coverage {
  matches: KeywordMatch[];
}

// ── Live scoring ──────────────────────────────────────────────────────────
//
// The shapes are declared in `lib/score.ts`, which owns the evaluation. Re-
// exported here so components import one module for API types.

export type { GapStatus, LiveRule, RuleResult, ScoreCard, ScoreResult, TermGroup } from "./score";

// ── Analysis ──────────────────────────────────────────────────────────────

export type Relevance = "critical" | "useful" | "neutral" | "noise";
export type Fit = "strong" | "workable" | "weak" | "mismatch";

export interface SectionAssessment {
  section_id: string;
  relevance: Relevance;
  verdict: string;
  strongest_node_ids: string[];
  weakest_node_ids: string[];
}

export interface Gap {
  requirement: string;
  essential: boolean;
  status: "covered" | "partial" | "missing";
  evidence_node_id: string | null;
  evidence_quote: string | null;
  similarity: number;
  literal: boolean;
}

export interface Analysis {
  job: {
    post: JobPost;
    optimises_for: string;
    evidence_wanted: string[];
    section_priority: string[];
    disqualifiers: string[];
  };
  cv: {
    positioning: string;
    strengths: string[];
    buried: string[];
    sections: SectionAssessment[];
  };
  gaps: { gaps: Gap[]; semantic: boolean };
}

// ── What to say on the call ───────────────────────────────────────────────

export interface FitPoint {
  claim: string;
  evidence: string;
}

export interface PitchGap {
  requirement: string;
  honest_answer: string;
}

export interface PitchCard {
  one_liner: string;
  why_you_fit: FitPoint[];
  talking_points: string[];
  gaps_to_own: PitchGap[];
  likely_questions: string[];
  ask_them: string[];
}

// ── Stream events ─────────────────────────────────────────────────────────

export type TailorEvent =
  | { kind: "start"; remaining_today: number; mode?: TailorMode }
  | { kind: "job"; job: JobPost }
  | {
      kind: "analysis";
      analysis: Analysis;
      scorecard: import("./score").ScoreCard;
      fit: Fit;
    }
  | {
      kind: "structure";
      operation: Record<string, unknown>;
      summary: string;
      reason: string;
    }
  | {
      kind: "redesign";
      intent: string;
      applied: number;
      rejected: number;
      removed: { kind: string; id: string; label: string; reason: string }[];
    }
  | {
      kind: "rebuilt";
      document: CVDocument;
      approach: string;
      match: number;
      fit: Fit;
      dropped: { text: string; reason: string; detail: string }[];
      per_requirement: Record<string, string>;
    }
  | { kind: "pitch"; document: "tailored" | "rebuilt"; card: PitchCard }
  | { kind: "coverage"; coverage: Coverage }
  | {
      kind: "suggestion";
      suggestion: Suggestion;
      section_id: string;
      section_title: string;
      flags: Flag[];
    }
  | {
      kind: "section_done";
      section_id: string;
      accepted: number;
      rejected: number;
    }
  | {
      kind: "done";
      accepted: number;
      rejected: number;
      rejections: Record<string, number>;
      cost_usd: number;
      seconds: number;
      fit: Fit;
      outcome: "improved" | "already_strong" | "cannot_help";
    }
  | { kind: "error"; message: string; hint: string };

// ── Library ───────────────────────────────────────────────────────────────

export type RecordStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn";

/** In the order an application actually moves through. */
export const STATUS_ORDER: readonly RecordStatus[] = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
];

export const STATUS_LABEL: Record<RecordStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Phone screen",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export interface CvVersionSummary {
  id: string;
  filename: string;
  source_format: string;
  content_hash: string;
  created_at: string;
  change_count: number;
}

export interface FrozenSnapshot {
  raw: string;
  parsed: JobPost | null;
  content_hash: string;
  captured_at: string;
  source_url: string | null;
}

export interface RecordSummary {
  id: string;
  company: string | null;
  role: string | null;
  location: string | null;
  status: RecordStatus;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  cv_count: number;
  keywords: string[];
}

export interface RecordDetail extends RecordSummary {
  notes: string | null;
  source_url: string | null;
  salary_text: string | null;
  snapshot: FrozenSnapshot | null;
  cv_versions: CvVersionSummary[];
}

export interface LibraryPage {
  records: RecordSummary[];
  total_shown: number;
  statuses: string[];
  anonymous: boolean;
}

export interface AuthSession {
  signed_in: boolean;
  email: string | null;
  claimed: number;
  development_mode: boolean;
}

/** A suggestion plus the local state of whether it has been applied. */
export interface Change {
  suggestion: Suggestion;
  sectionId: string;
  sectionTitle: string;
  flags: Flag[];
  status: "pending" | "applied" | "dismissed" | "stale";
  /** Kept so Apply can be undone exactly, without re-deriving anything. */
  previousText?: string;
}
