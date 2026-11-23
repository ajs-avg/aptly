/**
 * Where the camera stands, and where the paper sits, on every screen.
 *
 * The product used to mount a separate WebGL scene per screen — one on the
 * landing page, one for the waiting state, one behind the drop boxes. Three
 * canvases meant three rooms, and moving between screens read as three
 * different products loading one after another.
 *
 * There is one room now. Every screen names a pose in it, and the stage glides
 * from the pose it is in to the pose it has been asked for. Navigating is the
 * camera moving, which is the whole difference between a page that changes and
 * a place you are in.
 *
 * A pose is deliberately data, not code: it can be read, diffed and tweened,
 * and a new screen is a new entry here rather than a new canvas.
 */

export interface Pose {
  /** Where the camera is. */
  camera: [number, number, number];
  /** What it looks at. */
  target: [number, number, number];
  /** Field of view. Narrow reads as a long lens and flattens; wide dramatises. */
  fov: number;
  /** The CV: position, euler rotation, scale. */
  sheet: { at: [number, number, number]; turn: [number, number, number]; size: number };
  /** The second document — the job post, or the rebuilt CV. `size: 0` hides it. */
  second: { at: [number, number, number]; turn: [number, number, number]; size: number };
  /** How many sheets drift in the background, and how far back they sit. */
  depth: { count: number; spread: number };
  /** Key light strength, and how tight the fog closes in. */
  light: number;
  fog: [number, number];
  /** How much of the frame the room is allowed to occupy, 0–1. */
  presence: number;
}

const base: Pose = {
  camera: [0, 0, 5.2],
  target: [0, 0, 0],
  fov: 38,
  sheet: { at: [0, 0, 0], turn: [0.06, -0.3, 0], size: 1 },
  second: { at: [2.4, 0, -0.4], turn: [0, 0.5, 0], size: 0 },
  depth: { count: 5, spread: 7 },
  light: 2.6,
  fog: [6, 20],
  presence: 1,
};

function pose(over: Partial<Pose>): Pose {
  return {
    ...base,
    ...over,
    sheet: { ...base.sheet, ...over.sheet },
    second: { ...base.second, ...over.second },
    depth: { ...base.depth, ...over.depth },
  };
}

/**
 * The named places.
 *
 * Read as a journey rather than a list: the paper starts below the fold on the
 * landing page, rises to be read, is worked on close up, is filed away, and is
 * taken out again in the Library.
 */
export const POSES = {
  /* ── The landing page, as one continuous move ─────────────────────────── */

  "landing.hero": pose({
    camera: [0, 0.2, 4.6],
    fov: 42,
    // To the right of a left-aligned headline, large and turned away, so it
    // is the depth the picture sits in rather than a slab behind the words.
    sheet: { at: [1.5, 0.15, -0.5], turn: [0.22, -0.55, 0.05], size: 1.35 },
    depth: { count: 7, spread: 9 },
    light: 2.3,
    fog: [7, 22],
    presence: 0.9,
  }),

  "landing.read": pose({
    camera: [0, 0, 5],
    sheet: { at: [-0.8, 0.02, 0], turn: [0.06, -0.22, 0], size: 1 },
    second: { at: [0.95, 0, -0.25], turn: [0.04, 0.3, 0], size: 0.82 },
    light: 2.8,
  }),

  "landing.edit": pose({
    camera: [0, 0, 4.2],
    fov: 34,
    sheet: { at: [-0.45, 0, 0.3], turn: [0.03, -0.1, 0], size: 1.12 },
    second: { at: [1.7, -0.05, -0.5], turn: [0.04, 0.44, 0], size: 0.7 },
    light: 3.1,
    fog: [5, 16],
  }),

  "landing.keep": pose({
    camera: [0, 0, 5.6],
    sheet: { at: [-0.95, 0.05, 0], turn: [0, 0.1, 0], size: 0.6 },
    second: { at: [-0.1, 0.02, 0], turn: [0, -0.08, 0], size: 0.5 },
    depth: { count: 7, spread: 9 },
    light: 2.4,
  }),

  /* ── The product ──────────────────────────────────────────────────────── */

  /**
   * Two empty boxes, and the paper rising under them.
   *
   * Low enough that the boxes sit on it rather than in front of it — the
   * sheet peeking out between two panels reads as something that failed to
   * load, where the same sheet clearly *under* them reads as the thing they
   * are about to fill.
   */
  "tailor.drop": pose({
    camera: [0, 0.3, 4.6],
    fov: 42,
    sheet: { at: [0.1, -2.7, 0.5], turn: [0.32, -0.36, 0.03], size: 1.45 },
    depth: { count: 6, spread: 8.5 },
    light: 2.4,
    presence: 0.8,
  }),

  /** Being read. The beam runs and the job post arrives beside it. */
  "tailor.scan": pose({
    camera: [0, 0, 4.6],
    sheet: { at: [-0.7, 0, 0], turn: [0.05, -0.2, 0], size: 1 },
    second: { at: [1, 0, -0.2], turn: [0.04, 0.28, 0], size: 0.8 },
    light: 3,
    fog: [5, 17],
    presence: 1,
  }),

  /** The figure lands. Camera close, light up, everything else out of the way. */
  "tailor.score": pose({
    camera: [0, 0, 4.4],
    fov: 34,
    // Out of the ring's way: low, right and back, so the figure lands in clear
    // dark with the burst on it and the paper is the depth behind, not a
    // card the number has to be read through.
    sheet: { at: [1.9, -1.1, -1.6], turn: [0.14, -0.5, 0.04], size: 1.1 },
    depth: { count: 5, spread: 8 },
    light: 3.6,
    fog: [4.5, 15],
    presence: 0.6,
  }),

  /** The comparison. The real documents are on screen, so the room steps back. */
  "tailor.compare": pose({
    camera: [0, 0, 6.4],
    sheet: { at: [-2.6, -0.4, -2.2], turn: [0.04, -0.3, 0], size: 0 },
    second: { at: [2.6, -0.4, -2.2], turn: [0.04, 0.3, 0], size: 0 },
    depth: { count: 6, spread: 12 },
    light: 2.1,
    fog: [7, 24],
    presence: 0.5,
  }),

  /** The shelf. Camera back, the room reduced to depth behind the panels. */
  library: pose({
    camera: [0, 0.2, 7],
    fov: 42,
    sheet: { at: [-3.4, 0.4, -4], turn: [0.05, -0.34, 0.03], size: 1.1 },
    second: { at: [3.6, -0.3, -4.5], turn: [0.05, 0.34, -0.02], size: 1 },
    depth: { count: 8, spread: 13 },
    light: 2,
    fog: [7, 22],
    presence: 0.55,
  }),

  /** A working screen: light and depth only, so a form has a ground. */
  profile: pose({
    camera: [0, 0, 6.2],
    sheet: { at: [3, -0.3, -2.4], turn: [0.06, 0.4, 0], size: 0 },
    depth: { count: 6, spread: 12 },
    light: 2.1,
    fog: [8, 26],
    presence: 0.5,
  }),

  /** At rest, waiting to be let in. */
  "sign-in": pose({
    camera: [0, 0, 5.8],
    sheet: { at: [1.7, -0.2, -0.9], turn: [0.08, 0.46, 0.02], size: 0.78 },
    depth: { count: 6, spread: 9 },
    light: 2.3,
    presence: 0.42,
  }),

  /** Nothing to show. The room holds still, almost out of sight. */
  idle: pose({ presence: 0.14, light: 1.9, depth: { count: 4, spread: 8 } }),
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

/** Blend two poses. `t` of 0 is `a`, 1 is `b`. */
export function mix(a: Pose, b: Pose, t: number): Pose {
  const n = (x: number, y: number) => x + (y - x) * t;
  const v3 = (x: [number, number, number], y: [number, number, number]) =>
    [n(x[0], y[0]), n(x[1], y[1]), n(x[2], y[2])] as [number, number, number];

  return {
    camera: v3(a.camera, b.camera),
    target: v3(a.target, b.target),
    fov: n(a.fov, b.fov),
    sheet: {
      at: v3(a.sheet.at, b.sheet.at),
      turn: v3(a.sheet.turn, b.sheet.turn),
      size: n(a.sheet.size, b.sheet.size),
    },
    second: {
      at: v3(a.second.at, b.second.at),
      turn: v3(a.second.turn, b.second.turn),
      size: n(a.second.size, b.second.size),
    },
    depth: { count: Math.round(n(a.depth.count, b.depth.count)), spread: n(a.depth.spread, b.depth.spread) },
    light: n(a.light, b.light),
    fog: [n(a.fog[0], b.fog[0]), n(a.fog[1], b.fog[1])],
    presence: n(a.presence, b.presence),
  };
}
