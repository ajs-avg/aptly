"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useClientValue, useMediaQuery } from "@/lib/browser";
import { CV, H, POST, W, makePage, type Page } from "./page";
import { decayFlash, resolvedPose, stageRequest } from "./store";
import type { Pose } from "./poses";

/**
 * The room the whole product stands in.
 *
 * Mounted once, behind every screen, and never unmounted. Screens do not get
 * their own scene any more — they name a pose and this glides to it, so
 * moving from the Library to a tailoring run is the camera travelling rather
 * than one picture being swapped for another.
 *
 * Everything in it is one object seen from different distances: a sheet of
 * paper. That is the product's only real noun, and a room with one thing in it
 * that you keep approaching from new angles reads as a place, where a room
 * with a different thing on every screen reads as a slideshow.
 *
 * ── What keeps it cheap ───────────────────────────────────────────────────
 *
 * There is no post-processing. Depth comes from fog and from a dozen blurred
 * sheets drifting behind the lit one, which costs two draw calls instead of a
 * render target. The words on each sheet are one texture, drawn once; what
 * the beam lights is an instanced row of highlights over them. Nothing here is
 * state: the loop reads the request store directly, so a scroll does not
 * re-render.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIT = new THREE.Color("#2f9e8f");
const BEAM = new THREE.Color("#45bfac");

/**
 * A soft shadow, drawn once to a canvas.
 *
 * A flat plane at low opacity is not a shadow — it is a grey rectangle with
 * hard edges, and at this scale it read as a slab of card behind every sheet.
 * A radial falloff is what makes paper look like it is floating above
 * something rather than stuck to it.
 */
function makeBlob() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // On a dark ground a shadow is invisible; the sheet is lifted by a faint
    // teal glow instead, the same light the score lands in.
    g.addColorStop(0, "rgba(69,191,172,0.22)");
    g.addColorStop(0.4, "rgba(69,191,172,0.07)");
    g.addColorStop(1, "rgba(69,191,172,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ── One sheet: its words, its edge and its contact shadow ───────────────── */

function Paper({
  page,
  marksRef,
  coverRef,
}: {
  page: Page;
  /** Highlights over the rows of text, for the beam. */
  marksRef?: React.Ref<THREE.InstancedMesh>;
  /** A sheet-coloured plane that hides the part not yet "filled in". */
  coverRef?: React.Ref<THREE.Mesh>;
}) {
  const blob = useMemo(() => makeBlob(), []);
  useEffect(() => () => blob.dispose(), [blob]);

  return (
    <>
      <mesh position={[0.12, -0.2, -0.25]} renderOrder={-1}>
        <planeGeometry args={[W * 1.7, H * 1.45]} />
        <meshBasicMaterial map={blob} transparent opacity={0.85} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, 0, -0.004]}>
        <planeGeometry args={[W + 0.018, H + 0.018]} />
        <meshBasicMaterial color="#3a3d44" toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[W, H, 0.016]} />
        <meshStandardMaterial map={page.texture} roughness={0.6} metalness={0.15} />
      </mesh>
      {coverRef && (
        <mesh ref={coverRef} position={[0, 0, 0.0105]}>
          <planeGeometry args={[W, H]} />
          {/* Lit the same way as the face, so there is no seam where it ends. */}
          <meshStandardMaterial color="#141518" roughness={0.6} metalness={0.15} />
        </mesh>
      )}
      {marksRef && (
        <instancedMesh ref={marksRef} args={[undefined, undefined, page.rows.length]} frustumCulled={false}>
          <planeGeometry args={[1, 0.042]} />
          {/* Additive: a black instance adds nothing, so unlit rows are simply
              not there, and a lit one glows through the words rather than
              painting over them. */}
          <meshBasicMaterial
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      )}
    </>
  );
}

/* ── The sheets that only exist to give the room depth ────────────────────── */

function Depth({ max }: { max: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: max }, (_, i) => {
        const rand = mulberry32(400 + i);
        return {
          x: (rand() - 0.5) * 2,
          y: (rand() - 0.5) * 2.4,
          // Far enough back that fog does the blurring. Nothing here should
          // read as an object you could reach — it is the depth of the room.
          z: -5 - rand() * 9,
          turn: (rand() - 0.5) * 1.6,
          rise: 0.05 + rand() * 0.08,
          phase: rand() * Math.PI * 2,
          size: 1.3 + rand() * 1.4,
        };
      }),
    [max],
  );
  const live = useRef<Float32Array | null>(null);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const { depth, presence } = resolvedPose();
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    if (!live.current || live.current.length !== max) {
      live.current = new Float32Array(seeds.map((s) => s.y));
    }

    for (let i = 0; i < max; i++) {
      const s = seeds[i];
      const shown = i < depth.count ? 1 : 0;
      let y = live.current[i] + s.rise * dt;
      if (y > 5) y = -5;
      live.current[i] = y;

      o.position.set(s.x * depth.spread * 0.5, y, s.z);
      o.rotation.set(0.05, s.turn + Math.sin(t * 0.3 + s.phase) * 0.08, 0);
      o.scale.setScalar(Math.max(s.size * shown * presence, 0.0001));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, max]} frustumCulled={false}>
      {/* Flat planes, not lit boxes. A lit box at this distance comes back as
          a hard grey slab; an unlit plane at low opacity reads as paper far
          away, which is the only thing it is for. */}
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial
        color="#17181c"
        transparent
        opacity={0.3}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/* ── The room itself ──────────────────────────────────────────────────────── */

function Room({ motion, compact }: { motion: number; compact: boolean }) {
  const sheetGroup = useRef<THREE.Group>(null);
  const secondGroup = useRef<THREE.Group>(null);
  const marks = useRef<THREE.InstancedMesh>(null);
  const cover = useRef<THREE.Mesh>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const glow = useRef<THREE.PointLight>(null);
  const beam = useRef<THREE.Mesh>(null);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null);
  const fog = useRef<THREE.Fog>(null);

  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const pointer = useRef({ x: 0, y: 0 });
  /** The pose actually on screen, which chases the one being asked for. */
  const shown = useRef<Pose | null>(null);
  /** How far the beam has read down the sheet, held once a line is lit. */
  const read = useRef(new Float32Array(0));

  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const cv = useMemo(() => makePage(CV, anisotropy), [anisotropy]);
  const post = useMemo(() => makePage(POST, anisotropy), [anisotropy]);
  useEffect(() => () => cv.dispose(), [cv]);
  useEffect(() => () => post.dispose(), [post]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Where the highlights sit never changes — one per row of text, written once.
  useEffect(() => {
    const m = marks.current;
    if (!m) return;
    cv.rows.forEach((row, i) => {
      o.position.set(row.x, row.y, 0.012);
      o.rotation.set(0, 0, 0);
      o.scale.set(Math.max(row.w, 0.0001), 1, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setRGB(0, 0, 0));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cv, o, c]);

  useFrame((state, delta) => {
    const sheet = sheetGroup.current;
    const second = secondGroup.current;
    const markMesh = marks.current;
    if (!sheet || !second || !markMesh) return;

    const want = resolvedPose();
    const req = stageRequest();
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // The chase. A screen change asks for a new pose and the room travels to
    // it over about half a second, which is what makes navigation read as
    // movement rather than as a cut.
    if (!shown.current) shown.current = structuredClone(want);
    const k = 1 - Math.exp(-dt * 4.5);
    const now = shown.current;
    const approach = (a: number, b: number) => lerp(a, b, k);
    now.camera = [
      approach(now.camera[0], want.camera[0]),
      approach(now.camera[1], want.camera[1]),
      approach(now.camera[2], want.camera[2]),
    ];
    now.fov = approach(now.fov, want.fov);
    now.light = approach(now.light, want.light);
    now.presence = approach(now.presence, want.presence);
    now.fog = [approach(now.fog[0], want.fog[0]), approach(now.fog[1], want.fog[1])];
    now.sheet.at = [
      approach(now.sheet.at[0], want.sheet.at[0]),
      approach(now.sheet.at[1], want.sheet.at[1]),
      approach(now.sheet.at[2], want.sheet.at[2]),
    ];
    now.sheet.turn = [
      approach(now.sheet.turn[0], want.sheet.turn[0]),
      approach(now.sheet.turn[1], want.sheet.turn[1]),
      approach(now.sheet.turn[2], want.sheet.turn[2]),
    ];
    now.sheet.size = approach(now.sheet.size, want.sheet.size);
    now.second.at = [
      approach(now.second.at[0], want.second.at[0]),
      approach(now.second.at[1], want.second.at[1]),
      approach(now.second.at[2], want.second.at[2]),
    ];
    now.second.turn = [
      approach(now.second.turn[0], want.second.turn[0]),
      approach(now.second.turn[1], want.second.turn[1]),
      approach(now.second.turn[2], want.second.turn[2]),
    ];
    now.second.size = approach(now.second.size, want.second.size);

    // The flash a landed score asks for, decaying as it is spent.
    const burst = req.flash;
    decayFlash(dt * 1.6);

    const breathe = motion;
    const lean = compact ? 0 : motion;

    sheet.position.set(
      now.sheet.at[0] + pointer.current.x * 0.06 * lean,
      now.sheet.at[1] + Math.sin(t * 0.7) * 0.016 * breathe,
      now.sheet.at[2],
    );
    sheet.rotation.set(
      now.sheet.turn[0] - pointer.current.y * 0.07 * lean + Math.sin(t * 0.55) * 0.012 * breathe,
      now.sheet.turn[1] + pointer.current.x * 0.1 * lean + Math.sin(t * 0.45) * 0.018 * breathe,
      now.sheet.turn[2],
    );
    sheet.scale.setScalar(Math.max(now.sheet.size * now.presence, 0.0001));

    second.position.set(
      now.second.at[0],
      now.second.at[1] + Math.sin(t * 0.6 + 1.3) * 0.014 * breathe,
      now.second.at[2],
    );
    second.rotation.set(
      now.second.turn[0],
      now.second.turn[1] + Math.sin(t * 0.4 + 0.8) * 0.016 * breathe,
      now.second.turn[2],
    );
    second.scale.setScalar(Math.max(now.second.size * now.presence, 0.0001));

    // The beam, and the rows it has read.
    const rows = cv.rows;
    if (read.current.length !== rows.length) read.current = new Float32Array(rows.length);
    const CYCLE = 3.2;
    const phase = req.scanning && motion ? (t % CYCLE) / CYCLE : -1;
    const sweep = clamp01(phase / 0.76);
    const beamY = lerp(H / 2, -H / 2, sweep);
    const beamOn = phase >= 0 && phase < 0.8 ? 1 : 0;
    if (!req.scanning) read.current.fill(0);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (req.scanning && beamOn && beamY <= row.y + 0.02) read.current[i] = 1;
      const litness = read.current[i];
      const near = Math.max(0, 1 - Math.abs(row.y - beamY) / 0.1) * beamOn;
      c.setRGB(0, 0, 0).lerp(LIT, litness * 0.85).lerp(BEAM, near);
      markMesh.setColorAt(i, c);
    }
    if (markMesh.instanceColor) markMesh.instanceColor.needsUpdate = true;

    // The drop screen fills the sheet as the box fills: a sheet-coloured
    // plane over the part not yet written, shrinking upward from the bottom.
    if (cover.current) {
      const hidden = 1 - req.fill;
      cover.current.scale.y = Math.max(hidden, 0.0001);
      cover.current.position.y = -H / 2 + (hidden * H) / 2;
      cover.current.visible = hidden > 0.001;
    }

    if (beam.current && beamMat.current) {
      beam.current.position.set(0, beamY, 0.02);
      beamMat.current.opacity = beamOn * 0.5;
    }

    if (key.current) key.current.intensity = now.light + burst * 1.4;
    if (glow.current) glow.current.intensity = 6 + burst * 26;
    if (fog.current) {
      fog.current.near = now.fog[0];
      fog.current.far = now.fog[1];
    }

    // The camera. Pointer lean and the pose's own travel, together.
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.set(
      now.camera[0] + pointer.current.x * 0.12 * lean,
      now.camera[1] + pointer.current.y * 0.07 * lean,
      now.camera[2],
    );
    if (Math.abs(cam.fov - now.fov) > 0.01) {
      cam.fov = now.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(now.target[0], now.target[1], now.target[2]);
  });

  return (
    <>
      <fog ref={fog} attach="fog" args={["#08090a", 6, 20]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#2a2d33", "#08090a", 0.5]} />
      <directionalLight ref={key} position={[2.2, 3.6, 5]} intensity={2.4} color="#e8eef5" />
      <directionalLight position={[-3, 1, 3]} intensity={0.5} color="#45bfac" />
      {/* The one light that moves: it swells when a score lands. */}
      <pointLight ref={glow} position={[0, 0, 2.4]} intensity={6} color="#45bfac" distance={9} />

      <group ref={sheetGroup}>
        <Paper page={cv} marksRef={marks} coverRef={cover} />
        <mesh ref={beam}>
          <planeGeometry args={[W * 1.05, 0.07]} />
          <meshBasicMaterial
            ref={beamMat}
            color="#45bfac"
            transparent
            opacity={0}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      <group ref={secondGroup}>
        <Paper page={post} />
      </group>

      <Depth max={compact ? 5 : 10} />
    </>
  );
}

function canRender(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Mounted once, in the root layout.
 *
 * Fixed and behind everything, with no pointer events of its own — the room is
 * scenery, and every control in front of it belongs to the page.
 */
export function Stage() {
  const enabled = useClientValue(canRender, false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 720px)");

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 select-none"
      data-stage
    >
      <Canvas
        flat
        dpr={compact ? 1 : [1, 1.6]}
        camera={{ position: [0, 0, 5.2], fov: 38, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={reduced ? "demand" : "always"}
      >
        <Room motion={reduced ? 0 : 1} compact={compact} />
      </Canvas>
    </div>
  );
}
