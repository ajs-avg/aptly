/**
 * The one object this whole scene is made of: a sheet of paper.
 *
 * Geometry and materials are created once at module scope and shared by every
 * sheet. Building them per-instance is the usual reason a scene like this
 * stutters — a few hundred sheets means a few hundred shader compilations and
 * as many draw calls, on a machine that may have no discrete GPU at all.
 */

import * as THREE from "three";

import type { SceneTheme } from "./theme";

/** A4 proportions, in scene units. */
export const SHEET_WIDTH = 1;
export const SHEET_HEIGHT = 1.414;
export const SHEET_DEPTH = 0.006;

/* Starting values only. Every one of these materials is re-tinted from the
   live CSS custom properties on mount and on every theme change — see
   `applySceneTheme` at the foot of this file. Hard-coding them here and
   stopping is how a 3D layer ends up glowing paper-white behind a dark page. */
const INK = "#16181d";
const PAPER = "#fbfbfa";
const SIGNAL = "#14655c";
const AMBER = "#c0821f";

export const sheetGeometry = new THREE.BoxGeometry(
  SHEET_WIDTH,
  SHEET_HEIGHT,
  SHEET_DEPTH,
);

/** A printed line of text, seen from far enough away to be a bar. */
export const lineGeometry = new THREE.PlaneGeometry(1, 1);

export const paperMaterial = new THREE.MeshStandardMaterial({
  color: PAPER,
  roughness: 0.92,
  metalness: 0,
});

/**
 * Sheets in the swarm.
 *
 * Lit, not flat. An unlit material was the cheap choice and it looked exactly
 * that: every sheet the same value from every angle, so a page of them read as
 * grey rectangles drifting over the headline rather than as paper. Paper is
 * only legible as paper when its faces catch light differently.
 */
export const ghostMaterial = new THREE.MeshStandardMaterial({
  color: PAPER,
  roughness: 0.95,
  metalness: 0,
});

export const inkMaterial = new THREE.MeshBasicMaterial({
  color: INK,
  transparent: true,
  opacity: 0.14,
});

export const headingMaterial = new THREE.MeshBasicMaterial({
  color: INK,
  transparent: true,
  opacity: 0.62,
});

export const signalMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL });

export const amberMaterial = new THREE.MeshBasicMaterial({
  color: AMBER,
  transparent: true,
  opacity: 1,
});

export const amberWashMaterial = new THREE.MeshBasicMaterial({
  color: AMBER,
  transparent: true,
  opacity: 0.13,
});

/**
 * Where the printed lines sit on a sheet, as fractions of its face.
 *
 * Written out rather than randomised so every sheet reads as *a CV* — a name,
 * a rule, blocks of body text with ragged last lines — instead of noise that
 * happens to be rectangular.
 */
export interface PrintedLine {
  y: number;
  width: number;
  height: number;
  kind: "name" | "heading" | "body" | "rule";
  /** Body lines that the tailoring pass marks. */
  marked?: boolean;
}

export const CV_LINES: PrintedLine[] = [
  { y: 0.4, width: 0.42, height: 0.03, kind: "name" },
  { y: 0.345, width: 0.6, height: 0.01, kind: "body" },

  { y: 0.275, width: 0.22, height: 0.013, kind: "heading" },
  { y: 0.255, width: 0.76, height: 0.003, kind: "rule" },
  { y: 0.225, width: 0.76, height: 0.009, kind: "body" },
  { y: 0.203, width: 0.7, height: 0.009, kind: "body" },
  { y: 0.181, width: 0.44, height: 0.009, kind: "body" },

  { y: 0.115, width: 0.26, height: 0.013, kind: "heading" },
  { y: 0.095, width: 0.76, height: 0.003, kind: "rule" },
  { y: 0.065, width: 0.76, height: 0.009, kind: "body", marked: true },
  { y: 0.043, width: 0.72, height: 0.009, kind: "body", marked: true },
  { y: 0.021, width: 0.58, height: 0.009, kind: "body" },
  { y: -0.015, width: 0.76, height: 0.009, kind: "body", marked: true },
  { y: -0.037, width: 0.66, height: 0.009, kind: "body" },
  { y: -0.059, width: 0.4, height: 0.009, kind: "body" },

  { y: -0.125, width: 0.2, height: 0.013, kind: "heading" },
  { y: -0.145, width: 0.76, height: 0.003, kind: "rule" },
  { y: -0.175, width: 0.76, height: 0.009, kind: "body" },
  { y: -0.197, width: 0.62, height: 0.009, kind: "body" },
  { y: -0.233, width: 0.76, height: 0.009, kind: "body" },
  { y: -0.255, width: 0.48, height: 0.009, kind: "body" },

  { y: -0.32, width: 0.24, height: 0.013, kind: "heading" },
  { y: -0.34, width: 0.76, height: 0.003, kind: "rule" },
  { y: -0.37, width: 0.7, height: 0.009, kind: "body" },
  { y: -0.392, width: 0.52, height: 0.009, kind: "body" },
];

export function materialFor(kind: PrintedLine["kind"]) {
  if (kind === "name") return headingMaterial;
  if (kind === "heading") return signalMaterial;
  if (kind === "rule") return inkMaterial;
  return inkMaterial;
}

/** Deterministic pseudo-random, so the scene is identical on every load. */
export function noise(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/* The two inputs to how the sheets are painted, held here because they arrive
   from different places at different times — the palette from CSS when the
   theme changes, the density from the scene when the window is resized — and
   both have to be re-applied together whenever either moves. */
let palette: SceneTheme | null = null;
let density = 1;

/**
 * Re-tint every shared material for the theme now in force.
 *
 * Mutating the module-level materials rather than rebuilding them: they are
 * shared by every sheet precisely so the scene compiles one shader and issues
 * few draw calls, and replacing them on a theme change would throw that away at
 * the exact moment the page is already busy repainting.
 *
 * Opacities move too. Ink at 14% reads as a printed line on white and as
 * nothing at all on near-black, so the marks on the swarm have to gain weight
 * in dark exactly as the type does.
 */
export function applySceneTheme(theme: SceneTheme): void {
  palette = theme;
  paint();
}

/**
 * How solid the paper is, 0–1.
 *
 * On a wide display the sheets live in the margins and can be fully opaque —
 * they never cross a word. On a phone there are no margins: the text column is
 * the window, so paper that stays out of the way is paper that is off-screen,
 * which is precisely the bug this fixes. The sheets come *behind* the copy
 * instead, and this is what keeps them behind it — a wash of paper the words
 * sit on top of rather than a card competing with them.
 *
 * Every layer thins together. Dropping the sheet alone would leave its printed
 * lines floating at full strength on a ghost, which reads as damage rather than
 * as distance.
 */
export function applySceneDensity(next: number): void {
  // Called from a frame loop, so it has to be free when nothing has changed.
  if (Math.abs(next - density) < 0.005) return;
  density = next;
  paint();
}

function paint(): void {
  const theme = palette;
  if (!theme) return;

  paperMaterial.color.copy(theme.paper);
  ghostMaterial.color.copy(theme.paper);

  inkMaterial.color.copy(theme.ink);
  headingMaterial.color.copy(theme.ink);
  signalMaterial.color.copy(theme.signal);
  amberMaterial.color.copy(theme.amber);
  amberWashMaterial.color.copy(theme.amber);

  // A material only pays for blending when it is actually translucent. At full
  // density these go back to being opaque, which restores correct depth sorting
  // on the display that can see the sorting.
  const solid = density > 0.995;
  for (const material of [paperMaterial, ghostMaterial, signalMaterial]) {
    // `transparent` is part of a material's program key, so flipping it needs
    // the shader rebuilt. Only on an actual change — this runs on a resize, and
    // recompiling every frame of a drag would be worse than the bug.
    if (material.transparent !== !solid) {
      material.transparent = !solid;
      material.needsUpdate = true;
    }
    material.opacity = density;
  }

  // The sheets darken in dark mode, so printed lines need *less* contrast
  // against them, not more — the same ratio, measured against a dimmer page.
  inkMaterial.opacity = (theme.dark ? 0.17 : 0.14) * density;
  headingMaterial.opacity = (theme.dark ? 0.66 : 0.62) * density;
  amberMaterial.opacity = density;
  amberWashMaterial.opacity = (theme.dark ? 0.16 : 0.13) * density;
}

export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;

/** Ease a value into the window [from, to], flat outside it. */
export function stage(progress: number, from: number, to: number): number {
  return clamp((progress - from) / (to - from), 0, 1);
}

/** Smootherstep — no visible acceleration seam at either end. */
export function ease(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
