"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { Sheet } from "./Sheet";
import { POSES, type Pose, type SwarmFormation } from "./poses";
import {
  applySceneDensity,
  clamp,
  ghostMaterial,
  lerp,
  noise,
  sheetGeometry,
} from "./paper";
import { damp, steadyDelta, type SceneTheme } from "./theme";

/**
 * The scene, aligned to the page.
 *
 * `stage` is a float: its whole part is the index of the section the viewport
 * is centred on, and its fraction is how far through that section you are. So
 * the scene is always interpolating between the pose of the section you are
 * leaving and the pose of the one you are entering, and it can never drift out
 * of step with the words beside it.
 *
 * Nothing here re-renders. Every frame writes directly to object transforms.
 */

const SWARM = 16;

/* ═══════════════════════════════════════════════════════════════════════════
   Framing — the scene's answer to the shape of the window

   This scene was composed for a laptop, and every number in `poses.ts` assumes
   that shape: sheets at x ≈ ±3.5, a camera 5.4 back, a text column taking the
   middle half. On a 16:10 display that is exactly right.

   On a phone held upright it was not merely tighter — it was *empty*. At an
   aspect of 0.46 the visible half-width at the hero's depth is about one world
   unit, so a sheet at x = 3.5 is three frames off the side of the screen, and
   every one of the sixteen swarm sheets (x from 4.8 to 8.4) is further out
   still. The scene ran, cost its battery, and drew nothing but the ground
   colour. A tablet in portrait got one sheet, at the very edge, inside the fog.

   The fix is not a second set of hand-tuned poses — that is two compositions to
   keep in step, and they drift. It is one composition plus a description of how
   it collapses as the window narrows: pull the camera back, bring the sheets
   in, shrink them, thin them, and let them cross behind the text instead of
   pretending there is a margin to hide in.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Framing {
  /** Multiplier on the camera's distance. Pulling back fits more in. */
  dolly: number;
  /** Multiplier on every sheet's x. Brings the margins in as they vanish. */
  spread: number;
  /** Multiplier on every sheet's scale. */
  scale: number;
  /** How solid the paper is. Thinner where it has to pass behind the words. */
  density: number;
  /** 0 on a laptop or wider, 1 on a phone held upright. */
  narrow: number;
}

/** The aspect the poses were composed at. At or above it, nothing is changed. */
const WIDE_ASPECT = 1.5;
/** A tall phone. Below it there is nothing further to give. */
const TALL_ASPECT = 0.5;

/**
 * Read once per frame and mutated in place.
 *
 * A fresh object per frame is sixty allocations a second for a value that is
 * identical between resizes — small, but this is the frame loop, and the frame
 * loop is where "small and constant" becomes the whole cost.
 */
const framing: Framing = { dolly: 1, spread: 1, scale: 1, density: 1, narrow: 0 };

function measureFraming(aspect: number): void {
  const t = clamp((WIDE_ASPECT - aspect) / (WIDE_ASPECT - TALL_ASPECT), 0, 1);
  framing.narrow = t;
  framing.dolly = lerp(1, 1.45, t);
  framing.spread = lerp(1, 0.34, t);
  framing.scale = lerp(1, 0.7, t);
  framing.density = lerp(1, 0.5, t);
}

interface Props {
  /** Where the reader is, damped. Written by `Smoothing`, read by everything. */
  stageRef: React.RefObject<number>;
  reduced: boolean;
  /** False on a small screen, where the depth pass costs more than it shows. */
  shadows: boolean;
}

interface SceneProps extends Props {
  /** The reader's raw scroll position, straight off the scroll listener. */
  targetRef: React.RefObject<number>;
  theme: SceneTheme;
}

export function Scene({ stageRef, targetRef, reduced, theme, shadows }: SceneProps) {
  return (
    <>
      <color attach="background" args={[theme.ground.getHex()]} />
      {/* Fog in the ground colour, so sheets at the back dissolve into the page
          rather than ending at a visible edge. It has to follow the theme or the
          far sheets sit in a pale haze on a dark page.

          It starts further out than the camera ever pushes a sheet. That is not
          slack: on a narrow window the camera dollies back by half again, and
          fog tuned to the laptop framing would put every sheet on a phone in
          the haze — swapping a scene that drew nothing for one that drew a
          smudge. */}
      <fog attach="fog" args={[theme.ground.getHex(), 16, 40]} />

      <Smoothing stageRef={stageRef} targetRef={targetRef} reduced={reduced} />
      <Framer />

      {/* Key light high and to the left, the way a desk lamp falls on paper. */}
      <directionalLight
        position={[-4, 7, 6]}
        intensity={theme.key}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={26}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0006}
      />
      {/* Fill from the viewer's side, or any sheet turned away reads as grey
          card rather than paper. */}
      <directionalLight position={[2, 1, 9]} intensity={theme.fill} color="#ffffff" />
      <ambientLight intensity={theme.ambient} />

      <Swarm stageRef={stageRef} reduced={reduced} shadows={shadows} />
      <Hero stageRef={stageRef} reduced={reduced} shadows={shadows} />
      <Rig stageRef={stageRef} reduced={reduced} />
    </>
  );
}

/**
 * The one thing between the scroll wheel and the scene.
 *
 * Scroll position is not smooth. A trackpad delivers it in uneven bursts, a
 * mouse wheel in discrete steps, and momentum scrolling in a decaying stutter —
 * and driving the poses straight off it hands every one of those artefacts to
 * the animation. The sheets jitter, and it reads as a performance problem when
 * it is really a signal problem: the scene was perfectly smooth, it was just
 * faithfully following something that was not.
 *
 * So the listener writes `target` and this damps `stage` towards it. The scene
 * then always moves continuously, whatever the input did, and lags by a fixed
 * ~120ms that reads as weight rather than delay.
 */
function Smoothing({
  stageRef,
  targetRef,
  reduced,
}: {
  stageRef: React.RefObject<number>;
  targetRef: React.RefObject<number>;
  reduced: boolean;
}) {
  useFrame((_, delta) => {
    if (reduced) {
      // No easing to smooth when there is no motion to make; track exactly.
      stageRef.current = targetRef.current;
      return;
    }
    stageRef.current = damp(stageRef.current, targetRef.current, 8, steadyDelta(delta));
  });
  return null;
}

/**
 * Keeps the framing in step with the window.
 *
 * Reading the camera's own aspect rather than listening for a resize: the
 * camera is the thing that actually decides what is on screen, and it is
 * already updated for us before any frame runs. A separate resize listener is a
 * second source of truth that is wrong for one frame after every rotation — and
 * a phone being turned is exactly when this matters.
 *
 * It runs before the sheets because it is declared before them, and everything
 * downstream reads `framing` for the frame it was measured in.
 */
function Framer(): null {
  useFrame((state) => {
    measureFraming((state.camera as THREE.PerspectiveCamera).aspect);
    applySceneDensity(framing.density);
  });
  return null;
}

/** Read the two poses either side of the current stage, and how far between. */
function surrounding(stage: number): [Pose, Pose, number] {
  const clamped = clamp(stage, 0, POSES.length - 1);
  const index = Math.floor(clamped);
  const next = Math.min(index + 1, POSES.length - 1);
  return [POSES[index], POSES[next], clamped - index];
}

/** Half the visible width, in world units, at a given depth. */
function halfWidthAt(camera: THREE.PerspectiveCamera, z: number): number {
  const distance = Math.max(camera.position.z - z, 0.1);
  return (
    Math.tan((camera.fov / 2) * THREE.MathUtils.DEG2RAD) *
    distance *
    camera.aspect
  );
}

/** Half a sheet's width once scaled, plus a little air. */
const SHEET_HALF = 0.62;

/**
 * Keep a sheet inside the frame, and outside the text column.
 *
 * Hand-tuned x values cannot do this. The safe band depends on the viewport's
 * aspect ratio and on how deep the sheet sits, so a pose that frames perfectly
 * on a laptop hangs half off the edge on a narrow window and lands on the
 * headline on a wide one. Poses therefore say *which side and roughly how far*,
 * and this decides what actually fits.
 *
 * Where a safe band exists, the sheet goes in it and this is the whole story.
 *
 * Where one cannot exist, it has to place the sheet anyway — and that is the
 * case this used to get wrong. It stepped backwards looking for room, gave up
 * after four tries, and then returned *the x it was handed*, unchanged. On a
 * phone no amount of stepping back can open a band: the text column is the
 * window, so the inner limit grows with the frame just as fast as the outer
 * one. Every sheet therefore came back at its laptop x, three frames off the
 * side of the screen, and the whole scene rendered as a flat colour.
 *
 * The honest answer at that width is that there is no margin — so the sheet
 * stops pretending to hide in one. It parks against the edge and crops, which
 * reads as paper passing behind the page. `applySceneDensity` is what keeps
 * that from competing with the words in front of it.
 */
function frameSafe(
  camera: THREE.PerspectiveCamera,
  x: number,
  z: number,
  scale: number,
): { x: number; z: number } {
  const half = SHEET_HALF * scale;
  //  The centred column is 48rem of a 6xl page; in view-fraction terms it
  //  occupies roughly the middle 54% on a laptop and everything on a phone.
  const columnFraction = Math.min(
    0.54 * (1.9 / Math.max(camera.aspect, 0.35)),
    1.6,
  );

  // How far back the sheet would have to sit before a band opened at all.
  //
  // Solved rather than searched. The old version guessed — four fixed steps of
  // 1.6 — which is both too coarse to land on the right depth and, worse,
  // unable to tell "no room here, try further back" from "no room at any depth
  // this side of the horizon". Setting `outer > inner` and solving for the
  // frame width gives the answer outright: frame·(1 − column/2) > 2·half.
  const room = 1 - columnFraction / 2;
  const perUnit =
    Math.tan((camera.fov / 2) * THREE.MathUtils.DEG2RAD) *
    Math.max(camera.aspect, 0.35);
  // The 1.06 is not slop. Solved exactly, the depth is the one where the band
  // is precisely zero wide, so `outer > inner` is false by a rounding error and
  // the sheet falls through to the crop path having travelled the whole way for
  // nothing. Asking for a band six per cent wider than nothing lands it in one.
  const reach =
    room > 0.01
      ? ((2 * half) / room / perUnit) * 1.06 - (camera.position.z - z)
      : Number.POSITIVE_INFINITY;

  // And a limit on taking that answer. On a phone the band opens somewhere
  // around twenty-three units back, which is well inside the fog — so honouring
  // it would trade a sheet that is off the side of the screen for one that is a
  // smudge in the haze. Past this budget the sheet stays where the pose put it
  // and crops instead.
  const REACH_BUDGET = 4.8;
  const depth = reach > 0 && reach <= REACH_BUDGET ? z - reach : z;

  const frame = halfWidthAt(camera, depth);
  const inner = frame * columnFraction * 0.5 + half;
  const outer = frame - half;

  if (outer > inner) {
    return { x: Math.sign(x || 1) * clamp(Math.abs(x), inner, outer), z: depth };
  }

  // Against the edge, roughly half of it showing. Anchored to the frame rather
  // than to the requested x, because the requested x is the laptop's answer and
  // the laptop's answer is what is off-screen.
  const edge = Math.max(frame - half * 0.45, half * 0.35);
  return { x: Math.sign(x || 1) * Math.min(Math.abs(x), edge), z: depth };
}

/* ═══════════════════════════════════════════════════════════════════════════
   The other applications
   ═══════════════════════════════════════════════════════════════════════════ */

function Swarm({ stageRef, reduced, shadows }: Props) {
  const group = useRef<THREE.Group>(null);

  /** Every formation precomputed per sheet, so a frame is only lerps. */
  const sheets = useMemo(
    () =>
      Array.from({ length: SWARM }, (_, index) => {
        const seed = index + 1;
        const side = index % 2 === 0 ? 1 : -1;
        const rank = index / SWARM;

        return {
          formations: {
            // Drifting at both margins, unordered.
            scattered: {
              position: new THREE.Vector3(
                side * (4.8 + noise(seed * 3.1) * 3.6),
                (noise(seed * 7.3) - 0.5) * 7.4,
                -2.6 - noise(seed * 11.9) * 7.4,
              ),
              rotation: new THREE.Euler(
                (noise(seed * 13.1) - 0.5) * 0.3,
                (noise(seed * 17.3) - 0.5) * 0.55,
                (noise(seed * 19.7) - 0.5) * 0.45,
              ),
            },
            // A wide shallow arc, like documents laid out on a desk.
            fanned: {
              position: new THREE.Vector3(
                Math.sin((rank - 0.5) * Math.PI * 1.5) * 8.4,
                Math.cos((rank - 0.5) * Math.PI * 1.5) * 2.1 - 1.4,
                -3.4 - Math.abs(rank - 0.5) * 3.2,
              ),
              rotation: new THREE.Euler(
                0.06,
                (rank - 0.5) * -1.15,
                (rank - 0.5) * 0.3,
              ),
            },
            // The archive: a neat fanned stack, receding.
            filed: {
              position: new THREE.Vector3(
                -4.5 + (noise(seed * 23.3) - 0.5) * 0.12,
                2.5 - index * 0.16,
                -1.4 - index * 0.05,
              ),
              rotation: new THREE.Euler(
                0,
                0.3,
                (noise(seed * 29.1) - 0.5) * 0.03,
              ),
            },
            // Far back and out of the way.
            away: {
              position: new THREE.Vector3(
                side * (8.5 + noise(seed * 3.1) * 4),
                (noise(seed * 7.3) - 0.5) * 8,
                -9 - noise(seed * 11.9) * 6,
              ),
              rotation: new THREE.Euler(0, side * 0.5, 0),
            },
          } satisfies Record<
            SwarmFormation,
            { position: THREE.Vector3; rotation: THREE.Euler }
          >,
          drift: 0.4 + noise(seed * 31.7) * 0.8,
          phase: noise(seed * 37.3) * Math.PI * 2,
        };
      }),
    [],
  );

  useFrame((state) => {
    if (!group.current) return;

    const [from, to, t] = surrounding(stageRef.current);
    const eased = t * t * (3 - 2 * t);
    const time = reduced ? 0 : state.clock.elapsedTime;

    group.current.children.forEach((child, index) => {
      const sheet = sheets[index];
      if (!sheet) return;

      const a = sheet.formations[from.swarm];
      const b = sheet.formations[to.swarm];

      // Paper only drifts while it is loose. Once filed, it sits still —
      // motion that continues after the archive forms undoes the point of it.
      const settled =
        to.swarm === "filed" ? eased : from.swarm === "filed" ? 1 - eased : 0;
      const bob =
        Math.sin(time * 0.26 * sheet.drift + sheet.phase) *
        0.24 *
        (1 - settled);

      // The formations are written at laptop width, where the margins are real
      // and wide. `spread` folds them inwards as those margins close, so the
      // swarm stays in shot on a phone instead of drifting off both sides of
      // it — and `scale` keeps a sheet from filling a third of a small window
      // once it is no longer a third of the way to the edge.
      child.position.set(
        lerp(a.position.x, b.position.x, eased) * framing.spread,
        lerp(a.position.y, b.position.y, eased) + bob,
        lerp(a.position.z, b.position.z, eased),
      );
      child.rotation.set(
        lerp(a.rotation.x, b.rotation.x, eased),
        lerp(a.rotation.y, b.rotation.y, eased) +
          (reduced
            ? 0
            : Math.sin(time * 0.17 + sheet.phase) * 0.045 * (1 - settled)),
        lerp(a.rotation.z, b.rotation.z, eased),
      );
      child.scale.setScalar(framing.scale);
    });
  });

  return (
    <group ref={group}>
      {sheets.map((_, index) => (
        <mesh
          key={index}
          geometry={sheetGeometry}
          material={ghostMaterial}
          castShadow={shadows}
          receiveShadow={shadows}
        />
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Yours
   ═══════════════════════════════════════════════════════════════════════════ */

function Hero({ stageRef, reduced, shadows }: Props) {
  const group = useRef<THREE.Group>(null);
  const marking = useRef(0);

  useFrame((state) => {
    if (!group.current) return;

    const [from, to, t] = surrounding(stageRef.current);
    const eased = t * t * (3 - 2 * t);
    const time = reduced ? 0 : state.clock.elapsedTime;

    const a = from.hero;
    const b = to.hero;

    // The marks are the one thing that should not run backwards. Once a
    // section has shown them, scrolling on does not un-suggest the changes.
    marking.current = Math.max(
      marking.current,
      lerp(a.marking, b.marking, eased),
    );
    if (a.marking === 0 && b.marking === 0) marking.current = 0;

    const float = reduced ? 0 : Math.sin(time * 0.42) * 0.035;
    const scale = lerp(a.scale, b.scale, eased) * framing.scale;

    const placed = frameSafe(
      state.camera as THREE.PerspectiveCamera,
      lerp(a.position[0], b.position[0], eased) * framing.spread,
      lerp(a.position[2], b.position[2], eased),
      scale,
    );

    group.current.position.set(
      placed.x,
      lerp(a.position[1], b.position[1], eased) + float,
      placed.z,
    );
    group.current.rotation.set(
      lerp(a.rotation[0], b.rotation[0], eased),
      lerp(a.rotation[1], b.rotation[1], eased) +
        (reduced ? 0 : Math.sin(time * 0.3) * 0.012),
      lerp(a.rotation[2], b.rotation[2], eased),
    );
    group.current.scale.setScalar(scale);
  });

  return (
    <group ref={group}>
      <Sheet marking={marking} shadows={shadows} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Camera
   ═══════════════════════════════════════════════════════════════════════════ */

function Rig({ stageRef, reduced }: Omit<Props, "shadows">) {
  const pointer = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const [from, to, t] = surrounding(stageRef.current);
    const eased = t * t * (3 - 2 * t);
    // Exponential, not `delta * k`. The linear form is an approximation that
    // rings and overshoots once frames get long, which is exactly when the
    // scene can least afford to look unstable.
    const dt = steadyDelta(delta);

    if (!reduced) {
      pointer.current.x = damp(pointer.current.x, state.pointer.x, 4, dt);
      pointer.current.y = damp(pointer.current.y, state.pointer.y, 4, dt);
    }

    // The parallax has to shrink with the frame too. A pointer sweep worth
    // 0.42 units is a tenth of a laptop's visible width and most of a phone's,
    // where it would read as the whole scene sliding about under the thumb.
    const sway = lerp(1, 0.35, framing.narrow);

    const x =
      lerp(from.camera.x, to.camera.x, eased) + pointer.current.x * 0.42 * sway;
    const y =
      lerp(from.camera.y, to.camera.y, eased) + pointer.current.y * 0.24 * sway;
    // Dollying back is what buys the width a narrow window does not have. It
    // multiplies the pose's own distance rather than replacing it, so the
    // camera moves the poses still describe — closer for the hero, further for
    // the FAQ — survive on a phone instead of being flattened to one distance.
    const z = lerp(from.camera.z, to.camera.z, eased) * framing.dolly;

    state.camera.position.x = damp(state.camera.position.x, x, 4, dt);
    state.camera.position.y = damp(state.camera.position.y, y, 4, dt);
    state.camera.position.z = damp(state.camera.position.z, z, 4, dt);
    state.camera.lookAt(0, lerp(from.camera.y, to.camera.y, eased) - 0.1, 0);
  });

  return null;
}
