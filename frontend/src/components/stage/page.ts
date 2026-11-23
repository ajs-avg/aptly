import * as THREE from "three";

/**
 * A sheet with words on it.
 *
 * The room's paper used to carry twelve grey bars where a CV's lines would
 * be, and at the size the hero shows it that read as a wireframe of a
 * document rather than a document. This draws the real thing to a canvas —
 * name, headings, bullets, in the product's own faces — and the sheet wears
 * it as a texture. The rows it returns are where each line of body text
 * landed, in the sheet's own units, so the beam and the highlights can find
 * them.
 */

/** The sheet's size in the room. A4's proportions, near enough. */
export const W = 1.24;
export const H = 1.74;

/** Texture pixels per world unit. The hero shows the sheet at ~400 screen px
    across, so this is roughly two texels per pixel there. */
const PX = 1000;
const MARGIN = 0.11;

export interface Row {
  /** Vertical centre of the line, sheet units, 0 at the middle. */
  y: number;
  /** Horizontal centre of the ink, sheet units. */
  x: number;
  /** Width of the ink, sheet units. */
  w: number;
}

export type Block =
  | { kind: "name"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "role"; text: string }
  | { kind: "para"; text: string }
  | { kind: "bullet"; text: string };

/** The demo CV — the same one the landing frames show. */
export const CV: Block[] = [
  { kind: "name", text: "Rahul Menon" },
  { kind: "meta", text: "Frontend Developer · rahul.menon@example.com · Bengaluru" },
  { kind: "heading", text: "Professional summary" },
  {
    kind: "para",
    text: "Frontend developer with three years building customer-facing web applications. Comfortable owning a feature from design handoff through to production.",
  },
  { kind: "heading", text: "Technical skills" },
  { kind: "bullet", text: "Languages: JavaScript, TypeScript, Python, HTML5, CSS3" },
  { kind: "bullet", text: "Frontend: React, Next.js, Redux, Tailwind CSS" },
  { kind: "bullet", text: "Backend & Data: Node.js, Express.js, REST APIs, PostgreSQL, SQL" },
  { kind: "heading", text: "Work experience" },
  { kind: "role", text: "Frontend Developer · Kalyra Commerce · Jun 2023 – Present" },
  { kind: "bullet", text: "Rebuilt the product listing page in Next.js, cutting time to first paint from 4.1 seconds to 1.3." },
  {
    kind: "bullet",
    text: "Built the internal pricing dashboard end to end, writing the SQL queries that pull from PostgreSQL and the React interface that displays them.",
  },
  { kind: "bullet", text: "Wrote a Python script that reconciles the nightly product feed against the catalogue." },
  { kind: "role", text: "Junior Developer · Orbis Labs · Jul 2021 – May 2023" },
  { kind: "bullet", text: "Shipped the customer account pages and the checkout form validation." },
  { kind: "heading", text: "Education" },
  { kind: "para", text: "B.E. Computer Science · Visvesvaraya Technological University · 2021" },
];

/** The job it is being read against. */
export const POST: Block[] = [
  { kind: "name", text: "Data Engineer" },
  { kind: "meta", text: "Meridian Analytics · Bengaluru · Full-time · Hybrid" },
  { kind: "heading", text: "About the role" },
  {
    kind: "para",
    text: "You will own the pipelines that feed Meridian's retail analytics, from ingestion through to the models the dashboards read.",
  },
  { kind: "heading", text: "What we need" },
  { kind: "bullet", text: "3+ years in a data engineering role" },
  { kind: "bullet", text: "Strong SQL, including window functions" },
  { kind: "bullet", text: "Production Python — Pandas or PySpark" },
  { kind: "bullet", text: "Hands-on Airflow" },
  { kind: "bullet", text: "Dimensional modelling" },
  { kind: "bullet", text: "A cloud warehouse — Snowflake or BigQuery" },
  { kind: "bullet", text: "Comfort on AWS" },
  { kind: "heading", text: "Nice to have" },
  { kind: "bullet", text: "dbt in production" },
  { kind: "bullet", text: "Kafka or another streaming platform" },
  { kind: "bullet", text: "Retail or e-commerce data" },
];

export interface Page {
  texture: THREE.CanvasTexture;
  rows: Row[];
  dispose: () => void;
}

/** The product's own faces, read off the document so the sheet matches the page. */
function face(variable: string): string {
  const fallback = "ui-sans-serif, system-ui, sans-serif";
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

export function makePage(blocks: Block[], anisotropy = 1): Page {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * PX);
  canvas.height = Math.round(H * PX);
  const rows: Row[] = [];

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    rows.length = 0;

    const body = face("--font-inter");
    const display = face("--font-geist");
    const left = MARGIN * PX;
    const width = canvas.width - left * 2;
    const line = 38;
    let y = MARGIN * PX + 36;

    ctx.fillStyle = "#141518";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "alphabetic";

    /** Word-wrap in the current font. */
    const wrap = (text: string, max: number): string[] => {
      const out: string[] = [];
      let current = "";
      for (const word of text.split(" ")) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width > max && current) {
          out.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) out.push(current);
      return out;
    };

    /** A line of body text the beam can read: remember where it is. */
    const row = (x: number, baseline: number, inkWidth: number) => {
      rows.push({
        y: H / 2 - (baseline - 9) / PX,
        x: -W / 2 + (x + inkWidth / 2) / PX,
        w: inkWidth / PX,
      });
    };

    for (const block of blocks) {
      switch (block.kind) {
        case "name":
          ctx.font = `600 48px ${display}`;
          ctx.fillStyle = "#dde0e4";
          ctx.fillText(block.text, left, y);
          y += 56;
          break;
        case "meta":
          ctx.font = `400 23px ${body}`;
          ctx.fillStyle = "#8a8f98";
          ctx.fillText(block.text, left, y);
          y += 48;
          break;
        case "heading":
          y += 22;
          ctx.font = `500 21px ${display}`;
          ctx.fillStyle = "#8a8f98";
          ctx.fillText(block.text.toUpperCase().split("").join(" "), left, y);
          y += 16;
          ctx.fillStyle = "#2b2d33";
          ctx.fillRect(left, y, width, 2);
          y += 44;
          break;
        case "role":
          ctx.font = `500 26px ${display}`;
          ctx.fillStyle = "#c9ccd2";
          ctx.fillText(block.text, left, y);
          y += line + 4;
          break;
        case "para":
        case "bullet": {
          const indent = block.kind === "bullet" ? 30 : 0;
          ctx.font = `400 26px ${body}`;
          for (const [i, text] of wrap(block.text, width - indent).entries()) {
            if (block.kind === "bullet" && i === 0) {
              ctx.fillStyle = "#5c6169";
              ctx.beginPath();
              ctx.arc(left + 7, y - 9, 4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = "#a9aeb6";
            ctx.fillText(text, left + indent, y);
            row(left + indent, y, ctx.measureText(text).width);
            y += line;
          }
          y += 6;
          break;
        }
      }
    }
  };

  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;

  // On a cold load the web fonts land after the first draw; draw again in them.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    document.fonts.ready.then(() => {
      draw();
      texture.needsUpdate = true;
    });
  }

  return { texture, rows, dispose: () => texture.dispose() };
}
