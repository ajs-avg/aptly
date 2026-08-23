/**
 * Getting the palette out of CSS and into WebGL.
 *
 * The scene cannot use Tailwind classes, so without this it would carry its own
 * hard-coded copy of the palette — which is exactly how a 3D layer ends up
 * still glowing paper-white behind a page that went dark two releases ago.
 * Every colour it draws is read from the same custom properties the rest of the
 * product uses, so the two can never disagree.
 *
 * Read on demand rather than cached: `getComputedStyle` resolves whatever is in
 * force right now, including a system theme that changed while the tab was
 * open.
 */

import * as THREE from "three";

export interface SceneTheme {
  /** Page ground, used for both clear colour and fog so sheets fade into it. */
  ground: THREE.Color;
  /** The sheets themselves. Never pure white on a dark page — that is a lamp. */
  paper: THREE.Color;
  ink: THREE.Color;
  signal: THREE.Color;
  amber: THREE.Color;
  ambient: number;
  /** Key and fill intensities. They travel with the palette because a sheet's
      apparent brightness is base colour *times* lighting — dimming one without
      the other either glares or goes flat. */
  key: number;
  fill: number;
  dark: boolean;
}

const FALLBACK: Record<string, string> = {
  "--scene-ground": "#fbfbfa",
  "--scene-paper": "#ffffff",
  "--ink": "#16181d",
  "--signal": "#14655c",
  "--amber": "#c0821f",
};

function readVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim() || FALLBACK[name] || "#000000";
}

/**
 * @param scheme The resolved `color-scheme`, if the caller already has it.
 *   Passing it makes the value a real input rather than something this function
 *   goes and looks up again — which matters because callers memoise on it, and
 *   a dependency the body never reads is one a linter is right to flag and a
 *   reader is right to distrust.
 */
export function readSceneTheme(scheme?: string): SceneTheme {
  if (typeof window === "undefined") {
    return {
      ground: new THREE.Color(FALLBACK["--scene-ground"]),
      paper: new THREE.Color(FALLBACK["--scene-paper"]),
      ink: new THREE.Color(FALLBACK["--ink"]),
      signal: new THREE.Color(FALLBACK["--signal"]),
      amber: new THREE.Color(FALLBACK["--amber"]),
      ambient: 1.3,
      key: 2.6,
      fill: 1.3,
      dark: false,
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const number = (name: string, fallback: number) =>
    Number.parseFloat(styles.getPropertyValue(name)) || fallback;

  return {
    ground: new THREE.Color(readVar(styles, "--scene-ground")),
    paper: new THREE.Color(readVar(styles, "--scene-paper")),
    ink: new THREE.Color(readVar(styles, "--ink")),
    signal: new THREE.Color(readVar(styles, "--signal")),
    amber: new THREE.Color(readVar(styles, "--amber")),
    ambient: number("--scene-ambient", 1.3),
    key: number("--scene-key", 2.6),
    fill: number("--scene-fill", 1.3),
    dark: (scheme ?? styles.getPropertyValue("color-scheme").trim()) === "dark",
  };
}

/**
 * Frame-rate independent damping.
 *
 * The usual `value += (target - value) * 0.1` moves a tenth of the way *per
 * frame*, so the same scene settles twice as fast on a 120Hz display as on a
 * 60Hz one, and crawls whenever the frame rate dips. Multiplying by delta is
 * the common fix and is only a linear approximation of the right curve — it
 * overshoots and rings once frames get long.
 *
 * This is the exact solution to the same differential equation: after `dt`
 * seconds, exactly this fraction of the remaining distance has been covered,
 * whatever the frame rate. `lambda` is how many e-foldings per second — higher
 * is snappier.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/**
 * A frame's delta, with the pathological cases removed.
 *
 * Switching away from the tab and back produces one delta of several seconds.
 * Fed to any easing curve that lands the scene instantly in its final pose —
 * the animation visibly *snaps* the moment the page regains focus. Clamping to
 * a couple of frames' worth turns that into a normal catch-up.
 */
export function steadyDelta(delta: number): number {
  return Math.min(delta, 1 / 30);
}
