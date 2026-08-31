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

/**
 * Why a piece of text has no address in the uploaded file.
 *
 * Mirrors `SyntheticAnchor.origin` on the server, and must keep mirroring it.
 * This side is not only a reader of the model — it holds the document for the
 * whole editing session and posts it back at export — so an origin invented
 * here that the server cannot name is rejected as a malformed document, at the
 * exact moment somebody is trying to download their work. That is not a
 * hypothetical: `"claim"` was minted here and never added there, and every
 * download after using "Add what is missing" failed with "Aptly could not read
 * the edited CV".
 */
export type SyntheticOrigin = "vision" | "redesign" | "claim";

/**
 * Where a node came from in the original file.
 *
 * Discriminated on `kind` against the five the server defines, because that is
 * what makes the check work: a union whose other arm is `{ kind: string }`
 * accepts a malformed synthetic anchor happily, since `Exclude<string, "…">` is
 * still `string` and matches everything.
 *
 * Only the synthetic case spells out its fields. The rest are opaque on purpose
 * — a docx run span and a PDF bounding box are the server's business, and this
 * side only ever passes them back untouched. What it *mints* has to be typed,
 * and the synthetic one is the only thing it mints.
 */
export type Anchor =
  | {
      kind: "synthetic";
      origin: SyntheticOrigin;
      index?: number;
      page?: number | null;
    }
  | ({ kind: "docx" | "tex" | "pdf" | "text" } & Record<string, unknown>);

export interface TextNode {
  id: string;
  role: NodeRole;
  text: string;
  anchor: Anchor;
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
  /** What they asked to be called, given at sign-up. */
  name: string | null;
  claimed: number;
  /** True when Aptly's own password sign-in is in use rather than Supabase. */
  development_mode: boolean;
  /**
   * True where a password can be reset without an emailed link.
   *
   * A stand-in for the email step, off in production. The UI reads it rather
   * than assuming: a build that offers a reset the server will refuse is worse
   * than one that does not offer it.
   */
  direct_reset: boolean;
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

// ── The career profile ────────────────────────────────────────────────────
//
// Mirrors `aptly/profile/schemas.py`. This is what makes a rebuilt CV better
// than the document it came from: it holds what somebody has done across their
// whole career rather than what one CV had room for, and the no-fabrication
// checker pools it with the uploaded file — so a fuller profile widens what the
// model is *allowed* to say without loosening the rule that it may only say
// true things.

export type Proficiency = "learning" | "working" | "strong" | "expert";
export type WorkStyle = "no_preference" | "remote" | "hybrid" | "onsite";

export interface Identity {
  full_name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  open_to_relocation: boolean;
  work_authorisation: string;
  links: string[];
  summary: string;
}

export interface Achievement {
  text: string;
  /** The number, kept separately — this is the field later scoring reads. */
  metric: string;
  skills_used: string[];
}

export interface Role {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  is_current: boolean;
  employment_type: string;
  team_size: string;
  reported_to: string;
  what_you_did: string;
  achievements: Achievement[];
  technologies: string[];
  reason_for_leaving: string;
}

export interface Education {
  degree: string;
  field_of_study: string;
  institution: string;
  location: string;
  start: string;
  end: string;
  grade: string;
  highlights: string[];
}

export interface ProfileProject {
  name: string;
  description: string;
  role: string;
  technologies: string[];
  link: string;
  outcome: string;
  is_professional: boolean;
}

export interface Skill {
  name: string;
  category: string;
  proficiency: Proficiency;
  years: string;
  last_used: string;
}

export interface Certification {
  name: string;
  issuer: string;
  issued: string;
  expires: string;
  credential_id: string;
}

export interface ProfileLanguage {
  name: string;
  level: string;
}

export interface Publication {
  title: string;
  venue: string;
  date: string;
  link: string;
  description: string;
}

export interface Award {
  name: string;
  issuer: string;
  date: string;
  description: string;
}

export interface Volunteering {
  organisation: string;
  role: string;
  start: string;
  end: string;
  description: string;
}

export interface Preferences {
  target_roles: string[];
  target_industries: string[];
  seniority: string;
  work_style: WorkStyle;
  locations: string[];
  notice_period: string;
  salary_expectation: string;
  avoid: string[];
}

export interface CareerProfile {
  identity: Identity;
  roles: Role[];
  education: Education[];
  projects: ProfileProject[];
  skills: Skill[];
  certifications: Certification[];
  languages: ProfileLanguage[];
  publications: Publication[];
  awards: Award[];
  volunteering: Volunteering[];
  preferences: Preferences;
  notes: string;
}

export interface ProfileResponse {
  profile: CareerProfile;
  completeness: number;
  next_steps: string[];
}

/** One thing a newly-read CV says differently from what is already on file. */
export interface ProfileConflict {
  field: string;
  label: string;
  existing: string;
  incoming: string;
}

export interface ExtractResponse {
  profile: CareerProfile;
  completeness: number;
  conflicts: ProfileConflict[];
  added: string[];
  remaining_today: number;
}

// ── Proofreading ──────────────────────────────────────────────────────────
//
// Mechanical mistakes, found without a model. Every check is deterministic and
// runs in about a millisecond, so this is called on every edit — and cannot
// invent a problem that is not there, which is what lets it be trusted enough
// to be worth reading.

export type FindingSeverity = "error" | "warning" | "polish";

export interface ProofreadFinding {
  severity: FindingSeverity;
  /** A stable slug, so the UI can group without matching on prose. */
  kind: string;
  message: string;
  /** What to do about it. Never just "this is wrong". */
  hint: string;
  node_id: string | null;
  quote: string;
}

export interface ProofreadResponse {
  findings: ProofreadFinding[];
  errors: number;
  warnings: number;
  polish: number;
}

// ── Download layouts ──────────────────────────────────────────────────────
//
// A template is a StyleProfile on the server: page, margins, three font specs,
// heading treatment, body rhythm. Every renderer already reads its layout from
// that one object, which is why choosing one is a preset swap rather than a
// second rendering path.
//
// The typography comes down with each template so the dialog can preview a
// layout it does not itself render — and cannot drift from what the exporter
// will actually produce, because both read the same profile.

export interface CvTemplate {
  key: string;
  name: string;
  blurb: string;
  /** Who it suits. The thing that actually helps somebody decide. */
  suits: string;
  body_font: string;
  heading_rule: boolean;
  name_size_pt: number;
  body_size_pt: number;
  line_spacing: number;
}
