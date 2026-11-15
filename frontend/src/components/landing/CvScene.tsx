"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

import * as THREE from "three";

import { useClientValue, useMediaQuery } from "@/lib/browser";
import styles from "./landing.module.css";

/**
 * One CV, in three dimensions, doing the product's work as the page scrolls.
 *
 * The sheet is driven by a single number — the story's scroll progress —
 * and a clock. Progress decides where everything is and what state each line
 * is in; the clock adds the breathing. Nothing here is React state: the frame
 * loop reads the MotionValue directly, so a scroll never re-renders a tree.
 *
 *   0.00 – 0.10  hero: the sheet rests low and tilted under the headline
 *   0.10 – 0.40  read: it rises to meet the job post; matched lines get dots
 *   0.40 – 0.70  edit: one line is rewritten, one invented line is dropped
 *   0.70 – 1.00  keep: both shrink into a record, side by side
 */

const CV_W = 1.2;
const CV_H = 1.68;
const JOB_W = 0.96;
const JOB_H = 1.3;

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number };

const DESKTOP = {
  // Low in the frame, under the copy, its foot just past the viewport's edge:
  // the sheet rises into the picture as you scroll rather than sitting there.
  heroCv: { x: 0, y: -1.12, z: 0, rx: 0.18, ry: -0.42, rz: 0.03, s: 0.86 },
  readCv: { x: -0.6, y: 0.02, z: 0, rx: 0.06, ry: -0.22, rz: 0, s: 1.02 },
  editCv: { x: -0.42, y: 0, z: 0.25, rx: 0.04, ry: -0.1, rz: 0, s: 1.1 },
  keepCv: { x: -0.95, y: 0.05, z: 0, rx: 0, ry: 0.1, rz: 0, s: 0.62 },
  jobOff: { x: 4, y: 0.1, z: -0.3, rx: 0, ry: 0.5, rz: 0, s: 0.8 },
  jobRead: { x: 1.3, y: 0, z: -0.15, rx: 0.04, ry: 0.28, rz: 0, s: 0.82 },
  jobEdit: { x: 1.6, y: -0.05, z: -0.45, rx: 0.04, ry: 0.42, rz: 0, s: 0.72 },
  jobKeep: { x: -0.08, y: 0.02, z: 0, rx: 0, ry: -0.08, rz: 0, s: 0.5 },
};

/* A phone shows the captions along the bottom, so the sheets sit higher and
   closer together. */
/* A 390px phone shows about 1.6 units across at the sheet's depth, so every
   x here stays inside ±0.8 once the sheet's own width is counted. */
const COMPACT = {
  heroCv: { x: 0, y: -1.08, z: 0, rx: 0.16, ry: -0.38, rz: 0.03, s: 0.64 },
  readCv: { x: -0.28, y: 0.38, z: 0, rx: 0.06, ry: -0.18, rz: 0, s: 0.6 },
  editCv: { x: -0.26, y: 0.36, z: 0.1, rx: 0.04, ry: -0.08, rz: 0, s: 0.66 },
  keepCv: { x: -0.36, y: 0.42, z: 0, rx: 0, ry: 0.1, rz: 0, s: 0.42 },
  jobOff: { x: 2.4, y: 0.5, z: -0.3, rx: 0, ry: 0.5, rz: 0, s: 0.42 },
  jobRead: { x: 0.5, y: 0.4, z: -0.15, rx: 0.04, ry: 0.26, rz: 0, s: 0.42 },
  jobEdit: { x: 0.54, y: 0.38, z: -0.3, rx: 0.04, ry: 0.38, rz: 0, s: 0.4 },
  jobKeep: { x: 0.14, y: 0.4, z: 0, rx: 0, ry: -0.08, rz: 0, s: 0.34 },
};

type Layout = typeof DESKTOP;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 before `a`, 1 after `b`, eased between. */
function smooth(a: number, b: number, p: number) {
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Rises from `a` to `m`, falls back to zero by `b`. */
function bell(a: number, m: number, b: number, p: number) {
  return p < m ? smooth(a, m, p) : 1 - smooth(m, b, p);
}

function lerpPose(out: Pose, a: Pose, b: Pose, t: number) {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
  out.rx = lerp(a.rx, b.rx, t);
  out.ry = lerp(a.ry, b.ry, t);
  out.rz = lerp(a.rz, b.rz, t);
  out.s = lerp(a.s, b.s, t);
  return out;
}

function posesAt(p: number, L: Layout, cv: Pose, job: Pose) {
  const toRead = smooth(0.08, 0.24, p);
  const toEdit = smooth(0.4, 0.5, p);
  const toKeep = smooth(0.7, 0.86, p);

  lerpPose(cv, L.heroCv, L.readCv, toRead);
  lerpPose(cv, cv, L.editCv, toEdit);
  lerpPose(cv, cv, L.keepCv, toKeep);

  lerpPose(job, L.jobOff, L.jobRead, smooth(0.14, 0.3, p));
  lerpPose(job, job, L.jobEdit, toEdit);
  lerpPose(job, job, L.jobKeep, toKeep);
}

/* ── The lines on each sheet ─────────────────────────────────────────────── */

type Tone = "head" | "sub" | "body" | "muted";
type Line = { y: number; w: number; tone: Tone };

const REWRITE = 4;
const DROP = 7;
const MATCHED = [2, 4, 5, 8];

function layoutLines(count: number, h: number, specs: Array<[number, Tone]>): Line[] {
  const top = h / 2 - 0.2;
  const gap = (h - 0.42) / (count - 1);
  return specs.map(([w, tone], i) => ({ y: top - i * gap, w, tone }));
}

const CV_LINES = layoutLines(10, CV_H, [
  [0.58, "head"],
  [0.38, "sub"],
  [0.74, "body"],
  [0.66, "body"],
  [0.56, "body"],
  [0.7, "body"],
  [0.5, "body"],
  [0.64, "body"],
  [0.72, "body"],
  [0.44, "muted"],
]);

const JOB_LINES = layoutLines(7, JOB_H, [
  [0.5, "head"],
  [0.3, "sub"],
  [0.64, "body"],
  [0.56, "body"],
  [0.6, "body"],
  [0.48, "body"],
  [0.58, "muted"],
]);

const C = {
  head: new THREE.Color("#8b909a"),
  sub: new THREE.Color("#b8bcc4"),
  body: new THREE.Color("#d3d6db"),
  muted: new THREE.Color("#e2e4e7"),
  teal: new THREE.Color("#14655c"),
  amber: new THREE.Color("#c0821f"),
  danger: new THREE.Color("#b23b3b"),
  paper: new THREE.Color("#f7f7f5"),
};

const LINE_X0 = (w: number) => -w / 2 + 0.12;

/* A soft radial shadow, drawn once to a canvas. The sheet floats; this is
   what tells the eye how far above the paper it is. */
function makeBlob() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(22,24,29,0.55)");
    g.addColorStop(0.45, "rgba(22,24,29,0.18)");
    g.addColorStop(1, "rgba(22,24,29,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Sheet({
  width,
  height,
  lines,
  lineRef,
  children,
}: {
  width: number;
  height: number;
  lines: Line[];
  lineRef: React.RefObject<THREE.InstancedMesh | null>;
  children?: React.ReactNode;
}) {
  const blob = useMemo(() => makeBlob(), []);
  useEffect(() => () => blob.dispose(), [blob]);

  return (
    <>
      <mesh position={[0.1, -0.18, -0.22]} renderOrder={-1}>
        <planeGeometry args={[width * 1.55, height * 1.35]} />
        <meshBasicMaterial map={blob} transparent opacity={0.55} depthWrite={false} />
      </mesh>

      {/* A hairline edge, so the sheet still reads as an object where the
          light makes it the same white as the room. */}
      <mesh position={[0, 0, -0.003]}>
        <planeGeometry args={[width + 0.014, height + 0.014]} />
        <meshBasicMaterial color="#dcdcd8" toneMapped={false} />
      </mesh>

      <mesh>
        <boxGeometry args={[width, height, 0.016]} />
        <meshStandardMaterial color="#ffffff" roughness={0.7} metalness={0} />
      </mesh>

      <instancedMesh ref={lineRef} args={[undefined, undefined, lines.length]} frustumCulled={false}>
        <planeGeometry args={[1, 0.036]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {children}
    </>
  );
}

type Scratch = {
  cv: Pose;
  job: Pose;
  o: THREE.Object3D;
  color: THREE.Color;
  pointer: { x: number; y: number };
};

function makeScratch(): Scratch {
  return {
    cv: { ...DESKTOP.heroCv },
    job: { ...DESKTOP.jobOff },
    o: new THREE.Object3D(),
    color: new THREE.Color(),
    pointer: { x: 0, y: 0 },
  };
}

function Rig({ progress, motion, compact }: { progress: MotionValue<number>; motion: number; compact: boolean }) {
  const cvGroup = useRef<THREE.Group>(null);
  const jobGroup = useRef<THREE.Group>(null);
  const cvLines = useRef<THREE.InstancedMesh>(null);
  const jobLines = useRef<THREE.InstancedMesh>(null);
  const dots = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);

  const L = compact ? COMPACT : DESKTOP;

  // Working memory for the frame loop: poses, a throwaway Object3D, the last
  // pointer position, the intro's start time. A ref, filled on first use and
  // only ever touched from the loop and from effects — never during render.
  const scratchRef = useRef<Scratch | null>(null);
  const scratch = () => scratchRef.current ?? (scratchRef.current = makeScratch());
  // When the intro began, on the clock. Its own ref, written only by the loop.
  const introStart = useRef(-1);

  // The job sheet's lines never change; set them once.
  useEffect(() => {
    const mesh = jobLines.current;
    if (!mesh) return;
    const { o } = scratch();
    JOB_LINES.forEach((line, i) => {
      o.position.set(LINE_X0(JOB_W) + line.w / 2, line.y, 0.012);
      o.scale.set(line.w, 1, 1);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, C[line.tone]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const s = scratch();
      s.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      s.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const cvG = cvGroup.current;
    const jobG = jobGroup.current;
    const lines = cvLines.current;
    const dotMesh = dots.current;
    if (!cvG || !jobG || !lines || !dotMesh) return;
    const scratch = scratchRef.current ?? (scratchRef.current = makeScratch());

    const p = clamp01(progress.get());
    const t = state.clock.elapsedTime;
    if (introStart.current < 0) introStart.current = t;
    const intro = motion === 0 ? 1 : clamp01((t - introStart.current) / 1.4);
    const introEase = 1 - Math.pow(1 - intro, 3);

    posesAt(p, L, scratch.cv, scratch.job);
    const { cv, job } = scratch;

    const settle = 1 - smooth(0.7, 0.86, p);
    const breathe = motion * settle;
    cvG.position.set(
      cv.x,
      cv.y + (1 - introEase) * -0.5 + Math.sin(t * 0.9) * 0.022 * breathe,
      cv.z,
    );
    cvG.rotation.set(
      cv.rx + Math.sin(t * 0.7) * 0.015 * breathe,
      cv.ry + Math.sin(t * 0.55) * 0.03 * breathe,
      cv.rz,
    );
    cvG.scale.setScalar(cv.s);

    jobG.position.set(job.x, job.y + Math.sin(t * 0.8 + 1.3) * 0.02 * breathe, job.z);
    jobG.rotation.set(job.rx, job.ry + Math.sin(t * 0.5 + 0.7) * 0.025 * breathe, job.rz);
    jobG.scale.setScalar(job.s);

    // The edit beat, on two lines.
    const rewriteHold = bell(0.44, 0.54, 0.64, p);
    const rewriteWidth = smooth(0.5, 0.6, p);
    const rewriteTeal = smooth(0.58, 0.66, p);
    const dropRed = smooth(0.46, 0.51, p);
    const fall = smooth(0.55, 0.69, p);

    for (let i = 0; i < CV_LINES.length; i++) {
      const line = CV_LINES[i];
      let w = line.w * smooth(i * 0.05, i * 0.05 + 0.4, intro);
      let x = LINE_X0(CV_W) + w / 2;
      let y = line.y;
      let rz = 0;
      scratch.color.copy(C[line.tone]);

      if (i === REWRITE) {
        w = lerp(line.w, 0.72, rewriteWidth) * smooth(i * 0.05, i * 0.05 + 0.4, intro);
        x = LINE_X0(CV_W) + w / 2;
        scratch.color.lerp(C.amber, smooth(0.44, 0.5, p));
        scratch.color.lerp(C.teal, rewriteTeal);
      } else if (i === DROP) {
        scratch.color.lerp(C.danger, dropRed);
        y -= fall * 1.9;
        x += fall * 0.4;
        rz = -fall * 0.6;
        w *= 1 - fall * 0.85;
        scratch.color.lerp(C.paper, smooth(0.6, 0.69, p));
      }

      scratch.o.position.set(x, y, 0.012);
      scratch.o.rotation.set(0, 0, rz);
      scratch.o.scale.set(Math.max(w, 0.0001), 1, 1);
      scratch.o.updateMatrix();
      lines.setMatrixAt(i, scratch.o.matrix);
      lines.setColorAt(i, scratch.color);
    }
    lines.instanceMatrix.needsUpdate = true;
    if (lines.instanceColor) lines.instanceColor.needsUpdate = true;

    // Dots in the margin for the lines the post is satisfied by.
    for (let d = 0; d < MATCHED.length; d++) {
      const line = CV_LINES[MATCHED[d]];
      const s = smooth(0.24 + d * 0.03, 0.32 + d * 0.03, p) * 0.034;
      scratch.o.position.set(LINE_X0(CV_W) - 0.045, line.y, 0.014);
      scratch.o.rotation.set(0, 0, 0);
      scratch.o.scale.set(Math.max(s, 0.0001), Math.max(s, 0.0001), 1);
      scratch.o.updateMatrix();
      dotMesh.setMatrixAt(d, scratch.o.matrix);
    }
    dotMesh.instanceMatrix.needsUpdate = true;

    // The highlighter behind the line being rewritten.
    if (glow.current && glowMat.current) {
      const line = CV_LINES[REWRITE];
      const w = lerp(line.w, 0.72, rewriteWidth) + 0.08;
      glow.current.position.set(LINE_X0(CV_W) + w / 2 - 0.04, line.y, 0.01);
      glow.current.scale.set(w, 1, 1);
      glowMat.current.opacity = rewriteHold * 0.5;
      glowMat.current.color.copy(C.amber).lerp(C.teal, rewriteTeal);
    }

    // A camera that leans a little toward the pointer.
    const cam = state.camera;
    const k = 1 - Math.exp(-delta * 3);
    cam.position.x += (scratch.pointer.x * 0.14 * motion - cam.position.x) * k;
    cam.position.y += (scratch.pointer.y * 0.08 * motion - cam.position.y) * k;
    cam.lookAt(0, 0, 0);
  });

  return (
    <>
      <group ref={cvGroup}>
        <Sheet width={CV_W} height={CV_H} lines={CV_LINES} lineRef={cvLines}>
          <mesh ref={glow} renderOrder={1}>
            <planeGeometry args={[1, 0.09]} />
            <meshBasicMaterial ref={glowMat} transparent opacity={0} toneMapped={false} depthWrite={false} />
          </mesh>
          <instancedMesh ref={dots} args={[undefined, undefined, MATCHED.length]} frustumCulled={false}>
            <circleGeometry args={[1, 24]} />
            <meshBasicMaterial color="#14655c" toneMapped={false} />
          </instancedMesh>
        </Sheet>
      </group>

      <group ref={jobGroup}>
        <Sheet width={JOB_W} height={JOB_H} lines={JOB_LINES} lineRef={jobLines} />
      </group>
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

export function CvScene({ progress }: { progress: MotionValue<number> }) {
  const enabled = useClientValue(canRender, false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 720px)");

  if (!enabled) return <div className={styles.scene} aria-hidden />;

  return (
    <div className={styles.scene} aria-hidden>
      {/* `flat`: no filmic tone mapping. The default curve pulls a lit white
          down to a mid grey, and a grey sheet on pale paper is exactly what
          this scene must not be. */}
      <Canvas
        flat
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 5.4], fov: 36, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={reduced ? "demand" : "always"}
      >
        {/* Physical light units: a Lambert surface returns irradiance over π,
            so these read about three times brighter than they look. The lit
            face lands just over 1.0 and clips to paper white; the tilted
            sheets keep a little gradient. */}
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#ffffff", "#cfcfc9", 0.6]} />
        <directionalLight position={[2.5, 4, 5]} intensity={3.0} />
        <directionalLight position={[-3, 1, 3]} intensity={0.8} />

        <Rig progress={progress} motion={reduced ? 0 : 1} compact={compact} />
      </Canvas>
    </div>
  );
}
