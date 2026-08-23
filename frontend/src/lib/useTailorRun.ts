"use client";

import { useCallback, useMemo, useReducer } from "react";

import { applySuggestion, setNodeText, toPlainText } from "@/lib/document";
import { evaluate, type ScoreCard, type ScoreResult } from "@/lib/score";
import type {
  Analysis,
  Change,
  CVDocument,
  Fit,
  JobPost,
  PitchCard,
  Suggestion,
  TailorEvent,
} from "@/lib/types";

/**
 * One run, two CVs, and a score that moves while you edit.
 *
 * The screen shows the same job answered two ways — the person's own file with
 * changes applied to it, and a document written from scratch — so almost every
 * piece of state here exists twice. Keeping them in one reducer rather than two
 * hooks is deliberate: they share an analysis, a scorecard and a job, and the
 * comparison between them is the point of the screen. Split apart, "which is
 * ahead right now" becomes a question neither half can answer.
 *
 * Scores are derived, never stored. A cached number and an edited document are
 * two things that can disagree, and the one moment they would is exactly when
 * somebody is watching to see whether their edit helped.
 */

export type Side = "tailored" | "rebuilt";

export interface SideState {
  document: CVDocument | null;
  /**
   * The score the *server* gave this document, from a full analysis.
   *
   * Authoritative, and the number the live card is measured against rather than
   * replacing. The live card can only see requirements settled by naming
   * something; a rebuild that wins by finally evidencing "three years in the
   * role" moves a judged requirement, which the card is deliberately blind to.
   * Scoring both panels with the card alone showed the rebuilt CV at exactly the
   * original's figure — the two versions looked identical on the one number the
   * screen exists to compare.
   */
  serverScore: number | null;
  /**
   * The document's text at the moment `serverScore` was computed. Edits are
   * scored as a *delta* from here, so the authoritative number keeps its
   * meaning and typing still moves it.
   */
  anchorText: string | null;
  /** Suggestions for this side, with their applied/dismissed state. */
  changes: Change[];
  /** Text the person typed themselves, by node id. Kept so it survives a reset. */
  edited: Record<string, string>;
  pitch: PitchCard | null;
  /** Structural moves the redesign made, as sentences the person can read. */
  structure: { summary: string; reason: string }[];
  /** Lines the rebuild wrote that did not survive checking. */
  dropped: { text: string; reason: string; detail: string }[];
  approach: string;
  approved: boolean;
}

export interface RunState {
  phase: "idle" | "reading" | "working" | "ready" | "failed";
  job: JobPost | null;
  analysis: Analysis | null;
  scorecard: ScoreCard | null;
  fit: Fit | null;
  outcome: "improved" | "already_strong" | "cannot_help" | null;
  tailored: SideState;
  rebuilt: SideState;
  /** Which panel is expanded, or null when they sit side by side. */
  expanded: Side | null;
  notices: string[];
  error: { message: string; hint: string } | null;
  seconds: number;
  cost: number;
}

const emptySide = (): SideState => ({
  document: null,
  serverScore: null,
  anchorText: null,
  changes: [],
  edited: {},
  pitch: null,
  structure: [],
  dropped: [],
  approach: "",
  approved: false,
});

const initial: RunState = {
  phase: "idle",
  job: null,
  analysis: null,
  scorecard: null,
  fit: null,
  outcome: null,
  tailored: emptySide(),
  rebuilt: emptySide(),
  expanded: null,
  notices: [],
  error: null,
  seconds: 0,
  cost: 0,
};

type Action =
  | { type: "start"; document: CVDocument; notices: string[] }
  | { type: "event"; event: TailorEvent }
  | { type: "apply"; side: Side; suggestion: Suggestion }
  | { type: "undo"; side: Side; nodeId: string; previousText: string }
  | { type: "dismiss"; side: Side; nodeId: string }
  | { type: "applyAll"; side: Side }
  | { type: "edit"; side: Side; nodeId: string; text: string }
  | { type: "expand"; side: Side | null }
  | { type: "approve"; side: Side }
  | { type: "fail"; message: string; hint: string }
  | { type: "reset" };

function sideReducer(state: SideState, action: Action): SideState {
  switch (action.type) {
    case "apply": {
      if (!state.document) return state;
      const outcome = applySuggestion(state.document, action.suggestion);
      if (!outcome.ok) {
        // The line moved under the suggestion. Mark it rather than overwriting
        // — somebody's own edit outranks a proposal made before they made it.
        return {
          ...state,
          changes: state.changes.map((change) =>
            change.suggestion.node_id === action.suggestion.node_id
              ? { ...change, status: "stale" }
              : change,
          ),
        };
      }
      return {
        ...state,
        document: outcome.document,
        changes: state.changes.map((change) =>
          change.suggestion.node_id === action.suggestion.node_id
            ? { ...change, status: "applied", previousText: outcome.previousText }
            : change,
        ),
      };
    }

    case "undo": {
      if (!state.document) return state;
      return {
        ...state,
        document: setNodeText(state.document, action.nodeId, action.previousText),
        changes: state.changes.map((change) =>
          change.suggestion.node_id === action.nodeId
            ? { ...change, status: "pending", previousText: undefined }
            : change,
        ),
      };
    }

    case "dismiss":
      return {
        ...state,
        changes: state.changes.map((change) =>
          change.suggestion.node_id === action.nodeId
            ? { ...change, status: "dismissed" }
            : change,
        ),
      };

    case "applyAll": {
      let document = state.document;
      if (!document) return state;
      const changes = state.changes.map((change) => {
        if (change.status !== "pending") return change;
        const outcome = applySuggestion(document!, change.suggestion);
        if (!outcome.ok) return { ...change, status: "stale" as const };
        document = outcome.document;
        return { ...change, status: "applied" as const, previousText: outcome.previousText };
      });
      return { ...state, document, changes };
    }

    case "edit": {
      if (!state.document) return state;
      return {
        ...state,
        document: setNodeText(state.document, action.nodeId, action.text),
        edited: { ...state.edited, [action.nodeId]: action.text },
      };
    }

    case "approve":
      return { ...state, approved: true };

    default:
      return state;
  }
}

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "reset":
      return initial;

    case "start":
      return {
        ...initial,
        phase: "reading",
        notices: action.notices,
        tailored: { ...emptySide(), document: action.document },
      };

    case "fail":
      return {
        ...state,
        phase: "failed",
        error: { message: action.message, hint: action.hint },
      };

    case "expand":
      return { ...state, expanded: action.side };

    case "apply":
    case "undo":
    case "dismiss":
    case "applyAll":
    case "edit":
    case "approve":
      return { ...state, [action.side]: sideReducer(state[action.side], action) };

    case "event":
      return applyEvent(state, action.event);

    default:
      return state;
  }
}

function applyEvent(state: RunState, event: TailorEvent): RunState {
  switch (event.kind) {
    case "job":
      return { ...state, job: event.job };

    case "analysis":
      // The score is knowable the moment the analysis lands — long before any
      // suggestion exists. Showing it then is what makes the wait feel like
      // reading rather than loading.
      return {
        ...state,
        phase: "working",
        analysis: event.analysis,
        scorecard: event.scorecard,
        // Known now, not at the end. The verdict is the half of the reveal that
        // is actually useful, and it used to arrive a minute after the number.
        fit: event.fit,
        tailored: {
          ...state.tailored,
          serverScore: event.scorecard.baseline,
          anchorText: state.tailored.document ? toPlainText(state.tailored.document) : null,
        },
      };

    case "structure":
      return {
        ...state,
        tailored: {
          ...state.tailored,
          structure: [...state.tailored.structure, { summary: event.summary, reason: event.reason }],
        },
      };

    case "suggestion":
      return {
        ...state,
        tailored: {
          ...state.tailored,
          changes: [
            ...state.tailored.changes,
            {
              suggestion: event.suggestion,
              sectionId: event.section_id,
              sectionTitle: event.section_title,
              flags: event.flags,
              status: "pending",
            },
          ],
        },
      };

    case "rebuilt":
      return {
        ...state,
        rebuilt: {
          ...state.rebuilt,
          document: event.document,
          approach: event.approach,
          dropped: event.dropped,
          // Scored by a full re-analysis on the server, not assumed. The whole
          // claim of the second CV is that it answers the post better, and a
          // number nobody checked is not evidence of that.
          serverScore: event.match,
          anchorText: toPlainText(event.document),
        },
      };

    case "pitch":
      return {
        ...state,
        [event.document]: { ...state[event.document], pitch: event.card },
      };

    case "done":
      return {
        ...state,
        phase: "ready",
        fit: event.fit,
        outcome: event.outcome,
        seconds: event.seconds,
        cost: event.cost_usd,
      };

    case "error":
      return {
        ...state,
        phase: "failed",
        error: { message: event.message, hint: event.hint },
      };

    default:
      return state;
  }
}

export interface Scores {
  tailored: ScoreResult | null;
  rebuilt: ScoreResult | null;
  /** What the CV scored before anything was changed. */
  baseline: number;
}

/**
 * The server's figure, moved by whatever has been edited since.
 *
 * The card cannot recompute a judged requirement — it was settled by a model
 * reading the whole CV, and rewording a bullet does not change whether somebody
 * has three years of experience. So the card is used for what it *can* see: how
 * much the named terms have moved since the server last looked. That delta is
 * applied to the authoritative number.
 *
 * The result is a figure that is right when it arrives and honest as it moves,
 * rather than one that is either stale or wrong.
 */
function liveScore(card: ScoreCard, side: SideState): ScoreResult | null {
  if (!side.document) return null;

  const now = evaluate(card, toPlainText(side.document));
  if (side.serverScore === null || side.anchorText === null) return now;

  const moved = now.score - evaluate(card, side.anchorText).score;

  return {
    ...now,
    score: Math.max(0, Math.min(100, side.serverScore + moved)),
    baseline: card.baseline,
  };
}

export function useTailorRun() {
  const [state, dispatch] = useReducer(reducer, initial);

  /**
   * Both scores, recomputed from the documents as they stand.
   *
   * Derived on every render rather than cached. The evaluation is a few hundred
   * regex tests over a page of text — microseconds — and the alternative is a
   * stored number that can disagree with the document it describes at exactly
   * the moment somebody is watching it to see whether their edit helped.
   */
  const scores = useMemo<Scores>(() => {
    const card = state.scorecard;
    if (!card) return { tailored: null, rebuilt: null, baseline: 0 };
    return {
      tailored: liveScore(card, state.tailored),
      rebuilt: liveScore(card, state.rebuilt),
      baseline: card.baseline,
    };
  }, [state.scorecard, state.tailored, state.rebuilt]);

  const actions = useMemo(
    () => ({
      start: (document: CVDocument, notices: string[]) =>
        dispatch({ type: "start", document, notices }),
      event: (event: TailorEvent) => dispatch({ type: "event", event }),
      apply: (side: Side, suggestion: Suggestion) => dispatch({ type: "apply", side, suggestion }),
      undo: (side: Side, nodeId: string, previousText: string) =>
        dispatch({ type: "undo", side, nodeId, previousText }),
      dismiss: (side: Side, nodeId: string) => dispatch({ type: "dismiss", side, nodeId }),
      applyAll: (side: Side) => dispatch({ type: "applyAll", side }),
      edit: (side: Side, nodeId: string, text: string) =>
        dispatch({ type: "edit", side, nodeId, text }),
      expand: (side: Side | null) => dispatch({ type: "expand", side }),
      approve: (side: Side) => dispatch({ type: "approve", side }),
      fail: (message: string, hint: string) => dispatch({ type: "fail", message, hint }),
      reset: () => dispatch({ type: "reset" }),
    }),
    [],
  );

  const pendingCount = useCallback(
    (side: Side) => state[side].changes.filter((change) => change.status === "pending").length,
    [state],
  );

  return { state, scores, actions, pendingCount };
}
