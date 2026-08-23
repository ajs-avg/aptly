/**
 * What the scene is doing during each section of the page.
 *
 * The scene used to run one long timeline against total scroll, which meant it
 * was never quite saying what the section beside it said — the marks lit up
 * somewhere in the middle of "How it works", the archive formed under a
 * paragraph about trust. Here every section owns a pose, and the scene simply
 * moves between them.
 *
 * Sections declare themselves with `data-scene` in the page, so adding or
 * reordering one changes the choreography by changing the page, not by
 * re-deriving a set of magic scroll fractions.
 */

export type SwarmFormation =
  /** Drifting at the margins, unordered. The problem. */
  | "scattered"
  /** A loose arc, as if fanned out on a desk. Many formats, one tool. */
  | "fanned"
  /** A neat receding stack. The Library. */
  | "filed"
  /** Pushed far back, out of the way. */
  | "away";

export interface Pose {
  /** Which section this belongs to, matched against `data-scene`. */
  id: string;
  swarm: SwarmFormation;
  hero: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
    /** 0 → clean, 1 → every changed line marked. */
    marking: number;
  };
  camera: { x: number; y: number; z: number };
}

/**
 * Where a sheet can sit without either clipping or covering the text.
 *
 * The page is a centred column, so there is a usable band on each side and it
 * is narrower than it looks. At the camera distances used here the viewport is
 * about ±4.4 world units wide; the text column takes the middle ±2.4, and a
 * sheet is ~0.7 wide at half scale. That leaves roughly 3.1 to 3.8.
 *
 * Poses that ignored this were the reason the CV kept hanging off the left edge
 * in one section and sitting on the headline in another. Anything wanting to be
 * further out has to also move further back, where the frame is wider.
 */
export const SAFE_X = { min: 3.05, max: 3.9 } as const;
export const POSES: Pose[] = [
  {
    // Hero — your CV, held up, calm and unmarked.
    id: "hero",
    swarm: "scattered",
    hero: {
      position: [3.5, 0.45, -0.4],
      rotation: [0.02, -0.3, 0.03],
      scale: 1.0,
      marking: 0,
    },
    camera: { x: 0, y: 0.1, z: 5.4 },
  },
  {
    // Capabilities — the same document, every format, fanned out behind.
    id: "capabilities",
    swarm: "fanned",
    hero: {
      position: [3.8, 0.0, -1.4],
      rotation: [0.04, -0.4, 0.05],
      scale: 0.9,
      marking: 0,
    },
    camera: { x: 0, y: 0.15, z: 5.8 },
  },
  {
    // How it works — where the changes are described, so where the marks
    // arrive, beside the paragraph explaining them.
    id: "how",
    swarm: "away",
    hero: {
      position: [3.45, 0.0, -0.2],
      rotation: [0.01, -0.24, 0.01],
      scale: 1.12,
      marking: 1,
    },
    camera: { x: 0, y: 0.1, z: 5.3 },
  },
  {
    // The call — everything else recedes and the marked CV turns to face you.
    // Held low and left so it clears the headline, which is full width here.
    id: "call",
    swarm: "away",
    hero: {
      position: [-3.15, -1.05, 0.5],
      rotation: [0.02, 0.2, -0.02],
      scale: 1.2,
      marking: 1,
    },
    camera: { x: 0, y: -0.05, z: 5.6 },
  },
  {
    // Trust — the CV steps to the other margin, intact. Nothing added, nothing
    // taken away, so it keeps its marks and simply stays whole.
    id: "trust",
    swarm: "scattered",
    hero: {
      position: [-3.4, 0.3, -0.5],
      rotation: [0.02, 0.3, -0.03],
      scale: 1.0,
      marking: 1,
    },
    camera: { x: 0, y: 0.15, z: 5.6 },
  },
  {
    // Pricing — the archive, which is what a subscription actually buys. The
    // stack takes one margin, the CV the other.
    id: "pricing",
    swarm: "filed",
    hero: {
      position: [3.55, 0.2, -0.4],
      rotation: [0.01, -0.3, 0.02],
      scale: 1.05,
      marking: 1,
    },
    camera: { x: 0, y: 0.2, z: 6.0 },
  },
  {
    // FAQ — quiet. Nothing should compete with reading here.
    id: "faq",
    swarm: "away",
    hero: {
      position: [4.6, -0.5, -2.6],
      rotation: [0.06, -0.5, 0.05],
      scale: 0.85,
      marking: 1,
    },
    camera: { x: 0, y: 0.1, z: 6.2 },
  },
  {
    // Closing — one clean sheet, squared up, ready to start again.
    id: "closing",
    swarm: "away",
    hero: {
      position: [3.4, 0.05, -0.3],
      rotation: [0, -0.26, 0.01],
      scale: 1.05,
      marking: 0,
    },
    camera: { x: 0, y: 0.1, z: 5.5 },
  },
  {
    // Footer — everything settles out of frame.
    id: "footer",
    swarm: "away",
    hero: {
      position: [4.4, -1.9, -1.8],
      rotation: [0.05, -0.4, 0.04],
      scale: 0.9,
      marking: 0,
    },
    camera: { x: 0, y: -0.1, z: 6.4 },
  },
];

export const POSE_IDS = POSES.map((pose) => pose.id);
