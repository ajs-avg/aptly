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

  const node: TextNode = {
    // Marked so the UI can show which lines came from a claim rather than from
    // the uploaded file, and so an export knows it has no place in the original.
    id: `claim_${slug(sentence)}`,
    role: target?.kind === "summary" ? "summary" : "skill_line",
    text: sentence,
    anchor: { kind: "synthetic", origin: "claim" },
  };

  /*
   * No skills or summary section? Then make one.
   *
   * This used to return the document untouched, which meant the person wrote a
   * sentence about work their CV was missing, pressed Add, and watched nothing
   * happen — no line, no error, no explanation. Whether it worked depended
   * entirely on whether the parser had recognised a heading, and a CV whose
   * skills section is called "Core Competencies" or "Technical Toolkit" is
   * classified as `custom` and has neither.
   *
   * Refusing somebody's own true statement about themselves because their CV
   * lacks a particular heading is the wrong answer to that. A CV with no skills
   * section is precisely the CV that needs one.
   */
  if (!target) {
    return {
      ...document,
      sections: [
        ...document.sections,
        {
          id: `sec_claimed`,
          kind: "skills",
          title: "Skills",
          title_node: null,
          entries: [],
          loose_nodes: [node],
        },
      ],
    };
  }

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

/**
 * Put a new line into the CV, after the one it belongs with.
 *
 * The agent's other operation. A rewrite has something to replace and can wait
 * in the change list to be compared against; an addition has nothing to compare
 * against, so it goes in and its card records what was added.
 *
 * `after` is a node id or a section id. A node id puts the line directly below
 * that line, which is what "add a bullet under this job" means; a section id
 * appends to the section, which is what "add my GitHub to the links" means.
 * Neither found, the line goes to the end of the first section that will take
 * it rather than being dropped — an addition the person asked for and cannot
 * see is the worst of the three outcomes.
 */
export function addLine(
  document: CVDocument,
  after: string,
  text: string,
): CVDocument {
  const sentence = text.trim();
  if (!sentence) return document;

  const node: TextNode = {
    id: `agent_${slug(sentence)}`,
    role: "bullet",
    text: sentence,
    anchor: { kind: "synthetic", origin: "claim" },
  };

  let placed = false;

  const sections = document.sections.map((section) => {
    if (placed) return section;

    // Appended to a section named outright.
    if (section.id === after) {
      placed = true;
      return { ...section, loose_nodes: [...section.loose_nodes, node] };
    }

    // Or directly below a line, wherever in the section that line sits.
    const looseAt = section.loose_nodes.findIndex((item) => item.id === after);
    if (looseAt !== -1) {
      placed = true;
      const loose = [...section.loose_nodes];
      loose.splice(looseAt + 1, 0, { ...node, role: section.kind === "skills" ? "skill_line" : "freeform" });
      return { ...section, loose_nodes: loose };
    }

    const entries = section.entries.map((entry) => {
      if (placed) return entry;
      const isEntry = entry.id === after;
      const bulletAt = entry.bullets.findIndex((item) => item.id === after);
      if (!isEntry && bulletAt === -1) return entry;
      placed = true;
      const bullets = [...entry.bullets];
      bullets.splice(isEntry ? bullets.length : bulletAt + 1, 0, node);
      return { ...entry, bullets };
    });

    return placed ? { ...section, entries } : section;
  });

  if (placed) return { ...document, sections };

  // Nowhere named. The last section that holds loose lines will take it.
  const fallback = [...document.sections]
    .reverse()
    .find((section) => section.kind !== "header");
  if (!fallback) return document;

  return {
    ...document,
    sections: document.sections.map((section) =>
      section.id === fallback.id
        ? { ...section, loose_nodes: [...section.loose_nodes, node] }
        : section,
    ),
  };
}

/** Every node in a section, in the order they are printed. */
function sectionNodes(section: Section): TextNode[] {
  return [
    ...(section.title_node ? [section.title_node] : []),
    ...section.loose_nodes,
    ...section.entries.flatMap((entry) => [...entry.heading_nodes, ...entry.bullets]),
  ];
}

/**
 * Take a line out.
 *
 * The one operation that loses something, which is why it is the one the UI
 * shows in full before it happens — a person can read a rewrite and judge it,
 * and cannot read a line that is gone.
 *
 * Only ever removes prose. A heading, an employer or a date is a fact about the
 * person and about the shape of the document; deleting one on request would
 * leave a job with no title and bullets belonging to nothing.
 */
export function removeLine(document: CVDocument, nodeId: string): CVDocument {
  const node = findNode(document, nodeId);
  if (!node || node.role === "section_title") return document;

  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      loose_nodes: section.loose_nodes.filter((item) => item.id !== nodeId),
      entries: section.entries.map((entry) => ({
        ...entry,
        bullets: entry.bullets.filter((item) => item.id !== nodeId),
      })),
    })),
  };
}

/**
 * Move a line so it sits after another.
 *
 * The answer to "lead with the deployment one", which is a real request about a
 * real thing: a recruiter reads the first bullet under a job and skims the
 * rest, so the order of three sentences decides which one is read.
 *
 * Within its own section only. Moving a bullet from one job to another would
 * attach somebody's achievement to an employer they earned it at — which is a
 * fabrication that no text check can catch, because every word of it is true.
 *
 * `afterId` empty puts it first.
 */
export function moveLine(
  document: CVDocument,
  nodeId: string,
  afterId: string,
): CVDocument {
  const section = sectionOf(document, nodeId);
  if (!section || nodeId === afterId) return document;
  if (afterId && sectionOf(document, afterId)?.id !== section.id) return document;

  const reorder = (nodes: TextNode[]): TextNode[] => {
    const from = nodes.findIndex((item) => item.id === nodeId);
    if (from === -1) return nodes;
    const rest = nodes.filter((item) => item.id !== nodeId);
    const at = afterId ? rest.findIndex((item) => item.id === afterId) + 1 : 0;
    rest.splice(at, 0, nodes[from]);
    return rest;
  };

  // Both ends have to be in the same list, not merely the same section: a
  // bullet cannot be reordered against a loose line it never sits beside.
  const inLoose = section.loose_nodes.some((item) => item.id === nodeId);

  return {
    ...document,
    sections: document.sections.map((item) =>
      item.id !== section.id
        ? item
        : {
            ...item,
            loose_nodes: inLoose ? reorder(item.loose_nodes) : item.loose_nodes,
            entries: item.entries.map((entry) =>
              entry.bullets.some((bullet) => bullet.id === nodeId)
                ? { ...entry, bullets: reorder(entry.bullets) }
                : entry,
            ),
          },
    ),
  };
}

/** Whether a node still exists. Used before offering to act on one. */
export function hasNode(document: CVDocument, nodeId: string): boolean {
  return allNodes(document).some((node) => node.id === nodeId) ||
    document.sections.some((section) => sectionNodes(section).some((n) => n.id === nodeId));
}
