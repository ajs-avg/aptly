/**
 * Client-side edits to the CV.
 *
 * Applying a change never touches the network. The whole document lives in the
 * browser, so tapping Apply is instant, undo is exact, and the preview updates
 * in the same frame. The server is only involved again at export.
 *
 * Every function here is pure and returns a new document, so React re-renders
 * on identity and the undo stack is just a list of previous values.
 */

import type { CVDocument, Section, Suggestion, TextNode } from "./types";
import { EDITABLE_ROLES } from "./types";

/**
 * Mirrors `normalize_text` on the server, character for character.
 *
 * Both sides have to agree on whether a line "still says what the suggestion
 * thinks it says". Word, Google Docs and LaTeX emit different quotes, dashes
 * and spaces for text that reads identically, and a mismatch here would show
 * the user a change card that refuses to apply.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every addressable node, in reading order. */
export function allNodes(document: CVDocument): TextNode[] {
  const out: TextNode[] = [];
  for (const section of document.sections) {
    if (section.title_node) out.push(section.title_node);
    out.push(...section.loose_nodes);
    for (const entry of section.entries) {
      out.push(...entry.heading_nodes, ...entry.bullets);
    }
  }
  return out;
}

export function findNode(
  document: CVDocument,
  nodeId: string,
): TextNode | undefined {
  return allNodes(document).find((node) => node.id === nodeId);
}

export function isEditable(node: TextNode): boolean {
  return EDITABLE_ROLES.has(node.role);
}

/** The section a node belongs to, for scrolling the preview to it. */
export function sectionOf(
  document: CVDocument,
  nodeId: string,
): Section | undefined {
  return document.sections.find((section) => {
    if (section.title_node?.id === nodeId) return true;
    if (section.loose_nodes.some((node) => node.id === nodeId)) return true;
    return section.entries.some(
      (entry) =>
        entry.heading_nodes.some((node) => node.id === nodeId) ||
        entry.bullets.some((node) => node.id === nodeId),
    );
  });
}

/** A new document with one node's text replaced. Structure is untouched. */
export function setNodeText(
  document: CVDocument,
  nodeId: string,
  text: string,
): CVDocument {
  const rewrite = (node: TextNode): TextNode =>
    node.id === nodeId ? { ...node, text } : node;

  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      title_node: section.title_node ? rewrite(section.title_node) : null,
      loose_nodes: section.loose_nodes.map(rewrite),
      entries: section.entries.map((entry) => ({
        ...entry,
        heading_nodes: entry.heading_nodes.map(rewrite),
        bullets: entry.bullets.map(rewrite),
      })),
    })),
  };
}

export type ApplyOutcome =
  | { ok: true; document: CVDocument; previousText: string }
  | { ok: false; reason: "missing" | "not-editable" | "stale" };

/**
 * Apply a suggestion, refusing if the line has moved on.
 *
 * The stale check is the point. If the person edited that line themselves after
 * the suggestion was generated, applying would silently destroy their work — so
 * the card is marked stale instead, and they decide.
 */
export function applySuggestion(
  document: CVDocument,
  suggestion: Suggestion,
): ApplyOutcome {
  const node = findNode(document, suggestion.node_id);
  if (!node) return { ok: false, reason: "missing" };
  if (!isEditable(node)) return { ok: false, reason: "not-editable" };
  if (normalizeText(node.text) !== normalizeText(suggestion.before)) {
    return { ok: false, reason: "stale" };
  }
  return {
    ok: true,
    document: setNodeText(document, node.id, suggestion.after),
    previousText: node.text,
  };
}

/** The CV as plain text, for word counts and the copy-to-clipboard action. */
export function toPlainText(document: CVDocument): string {
  const lines: string[] = [];
  const { contact } = document;

  if (contact.name) lines.push(contact.name);
  const details = [contact.email, contact.phone, contact.location].filter(
    Boolean,
  );
  if (details.length) lines.push(details.join(" | "));
  if (contact.links.length) lines.push(contact.links.join(" | "));

  for (const section of document.sections) {
    if (section.kind === "header") continue;
    lines.push("", (section.title ?? section.kind).toUpperCase());
    for (const node of section.loose_nodes) lines.push(node.text);
    for (const entry of section.entries) {
      const heading = [entry.role, entry.org].filter(Boolean).join(", ");
      const dates = [entry.start, entry.end].filter(Boolean).join(" – ");
      lines.push("", [heading, dates].filter(Boolean).join(" — "));
      for (const bullet of entry.bullets) lines.push(`- ${bullet.text}`);
    }
  }
  return lines.join("\n").trim();
}

export function wordCount(document: CVDocument): number {
  return toPlainText(document).split(/\s+/).filter(Boolean).length;
}

/**
 * Put a claimed skill onto the CV, in the person's own words.
 *
 * Called only from the skill-gap flow, where somebody has said where they used
 * something. Their sentence goes in verbatim: this never composes a line, never
 * rephrases one, and never adds the bare term on its own.
 *
 * That last part matters more than it looks. A keyword dropped into a skills
 * list is the weakest possible form of the claim — it is what keyword-stuffing
 * looks like to an ATS, and it is the version a person cannot defend in an
 * interview because there is nothing behind it. A sentence saying where the work
 * happened is stronger evidence and safer to have written.
 *
 * Appended to the skills section when there is one, since that is where a
 * reader scans for exactly this. Failing that, to the summary.
 */
export function addClaim(document: CVDocument, text: string): CVDocument {
  const sentence = text.trim();
  if (!sentence) return document;

  const target =
    document.sections.find((section) => section.kind === "skills") ??
    document.sections.find((section) => section.kind === "summary");

  if (!target) return document;

  const node: TextNode = {
    // Marked so the UI can show which lines came from a claim rather than from
    // the uploaded file, and so an export knows it has no place in the original.
    id: `claim_${slug(sentence)}`,
    role: target.kind === "skills" ? "skill_line" : "summary",
    text: sentence,
    anchor: { kind: "synthetic", origin: "claim" },
  };

  return {
    ...document,
    sections: document.sections.map((section) =>
      section.id === target.id
        ? { ...section, loose_nodes: [...section.loose_nodes, node] }
        : section,
    ),
  };
}

/** A short stable id from the text itself. Only ever used for claimed lines. */
function slug(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
