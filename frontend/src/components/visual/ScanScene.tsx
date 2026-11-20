"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useClientValue, useMediaQuery } from "@/lib/browser";

/**
 * The CV being read, while it is being read.
 *
 * A tailoring run takes about a minute, and the screen that spends it used to
 * be a four-item checklist on an empty page. This is the same four steps shown
 * as the thing they describe: a beam travels down the sheet, each line it
 * crosses lights and holds, the job post slides in beside it at the second
 * step, and matched lines pick up a mark at the third.
 *
 * It is a read-only picture of progress — nothing here can be clicked, and
 * nothing it shows is invented: the step is the truth, the sheet is a
 * diagram. On a device with no WebGL, or for someone who asked motion to stop,
 * the caller falls back to the plain list.
 */

const SHEET_W = 1.3;
const SHEET_H = 1.82;
const JOB_W = 1.04;
const JOB_H = 1.42;
const LINES = 11;
const JOB_LINES = 7;

type Stage = 0 | 1 | 2 | 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function smooth(a: number, b: number, p: number) {
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
}

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

type Line = { y: number; w: number; head: boolean; matched: boolean };

function makeLines(count: number, h: number, seed: number, matchRate: number): Line[] {
  const rand = mulberry32(seed);
  const top = h / 2 - 0.22;
  const gap = (h - 0.46) / (count - 1);
  return Array.from({ length: count }, (_, i) => ({
    y: top - i * gap,
    w: i === 0 ? 0.52 + rand() * 0.16 : 0.3 + rand() * 0.6,
    head: i === 0 || i === 4,
    matched: i !== 0 && rand() < matchRate,
  }));
}

const CV_LINES = makeLines(LINES, SHEET_H, 11, 0.36);
const JOB_SPEC = makeLines(JOB_LINES, JOB_H, 23, 0);

const INK = new THREE.Color("#c3c6cc");
const HEAD = new THREE.Color("#8d9099");
const LIT = new THREE.Color("#2f9e8f");
const BEAM = new THREE.Color("#45bfac");

function Sheets({ stage, motion }: { stage: Stage; motion: number }) {
  const cvLines = useRef<THREE.InstancedMesh>(null);
  const jobLines = useRef<THREE.InstancedMesh>(null);
  const marks = useRef<THREE.InstancedMesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null);
  const cvGroup = useRef<THREE.Group>(null);
  const jobGroup = useRef<THREE.Group>(null);

  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  /** How far down the sheet each line has been read, 0–1, held once lit. */
  const read = useRef<Float32Array>(new Float32Array(LINES));
  const entered = useRef(-1);

  useEffect(() => {
    const mesh = jobLines.current;
    if (!mesh) return;
    JOB_SPEC.forEach((line, i) => {
      o.position.set(-JOB_W / 2 + 0.12 + line.w / 2, line.y, 0.012);
      o.rotation.set(0, 0, 0);
      o.scale.set(line.w, 1, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, line.head ? HEAD : INK);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [o]);

  useFrame((state, delta) => {
    const lines = cvLines.current;
    const markMesh = marks.current;
    if (!lines || !markMesh || !cvGroup.current || !jobGroup.current) return;

    const t = state.clock.elapsedTime;
    if (entered.current < 0) entered.current = t;
    const age = t - entered.current;
    const intro = motion === 0 ? 1 : clamp01(age / 1.2);
    const introEase = 1 - Math.pow(1 - intro, 3);

    // The beam sweeps top to bottom on a loop, and pauses off the bottom edge
    // between passes so the sheet is readable rather than strobing.
    const CYCLE = 3.4;
    const phase = motion === 0 ? 0.5 : ((age % CYCLE) / CYCLE);
    const sweep = clamp01(phase / 0.78);
    const beamY = lerp(SHEET_H / 2, -SHEET_H / 2, sweep);
    const beamOn = motion === 0 ? 0 : phase < 0.8 ? 1 : 0;

    // The job post arrives at step two and settles beside the CV.
    const paired = smooth(0, 1, stage >= 1 ? 1 : 0);
    const pairEase = motion === 0 ? paired : lerp(jobGroup.current.userData.p ?? 0, paired, 1 - Math.exp(-delta * 3));
    jobGroup.current.userData.p = pairEase;

    const cvX = lerp(0, -0.78, pairEase);
    cvGroup.current.position.set(cvX, (1 - introEase) * -0.45, 0);
    cvGroup.current.rotation.set(
      0.06 + Math.sin(t * 0.6) * 0.012 * motion,
      lerp(0, -0.16, pairEase) + Math.sin(t * 0.45) * 0.02 * motion,
      0,
    );
    cvGroup.current.scale.setScalar(lerp(1, 0.96, pairEase) * (0.9 + 0.1 * introEase));

    jobGroup.current.position.set(lerp(2.6, 0.92, pairEase), Math.sin(t * 0.5 + 1.2) * 0.016 * motion, -0.25);
    jobGroup.current.rotation.set(0.04, lerp(0.6, 0.3, pairEase), 0);
    jobGroup.current.scale.setScalar(0.82 * pairEase + 0.0001);

    for (let i = 0; i < LINES; i++) {
      const line = CV_LINES[i];
      // A line counts as read once the beam has passed it at least once.
      const passed = beamY <= line.y + 0.02 ? 1 : 0;
      read.current[i] = Math.max(read.current[i], stage >= 1 ? passed : 0);
      const lit = read.current[i];

      const grow = smooth(i * 0.04, i * 0.04 + 0.35, intro);
      const w = Math.max(line.w * grow, 0.0001);
      o.position.set(-SHEET_W / 2 + 0.14 + w / 2, line.y, 0.012);
      o.rotation.set(0, 0, 0);
      o.scale.set(w, line.head ? 1.5 : 1, 1);
      o.updateMatrix();
      lines.setMatrixAt(i, o.matrix);

      // Lit lines stay teal; the beam adds a brighter flash as it crosses.
      const near = Math.max(0, 1 - Math.abs(line.y - beamY) / 0.1) * beamOn;
      c.copy(line.head ? HEAD : INK)
        .lerp(LIT, lit * 0.85)
        .lerp(BEAM, near * 0.9);
      lines.setColorAt(i, c);

      // A mark in the margin, but only for the lines the post actually wants,
      // and only once the scoring step has been reached.
      const want = line.matched && stage >= 2 ? lit : 0;
      const s = want * 0.036;
      o.position.set(-SHEET_W / 2 + 0.072, line.y, 0.015);
      o.scale.set(Math.max(s, 0.0001), Math.max(s, 0.0001), 1);
      o.updateMatrix();
      markMesh.setMatrixAt(i, o.matrix);
    }
    lines.instanceMatrix.needsUpdate = true;
    if (lines.instanceColor) lines.instanceColor.needsUpdate = true;
    markMesh.instanceMatrix.needsUpdate = true;

    if (beam.current && beamMat.current) {
      beam.current.position.set(0, beamY, 0.02);
      beamMat.current.opacity = beamOn * 0.55 * introEase;
    }
  });

  return (
    <>
      <group ref={cvGroup}>
        <mesh position={[0.08, -0.14, -0.2]} renderOrder={-1}>
          <planeGeometry args={[SHEET_W * 1.5, SHEET_H * 1.3]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.05} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.003]}>
          <planeGeometry args={[SHEET_W + 0.015, SHEET_H + 0.015]} />
          <meshBasicMaterial color="#dddcd8" toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[SHEET_W, SHEET_H, 0.016]} />
          <meshStandardMaterial color="#ffffff" roughness={0.72} metalness={0} />
        </mesh>

        <instancedMesh ref={cvLines} args={[undefined, undefined, LINES]} frustumCulled={false}>
          <planeGeometry args={[1, 0.034]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>

        <instancedMesh ref={marks} args={[undefined, undefined, LINES]} frustumCulled={false}>
          <circleGeometry args={[1, 20]} />
          <meshBasicMaterial color="#14655c" toneMapped={false} />
        </instancedMesh>

        <mesh ref={beam}>
          <planeGeometry args={[SHEET_W * 1.04, 0.07]} />
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

      <group ref={jobGroup}>
        <mesh position={[0, 0, -0.003]}>
          <planeGeometry args={[JOB_W + 0.014, JOB_H + 0.014]} />
          <meshBasicMaterial color="#dddcd8" toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[JOB_W, JOB_H, 0.014]} />
          <meshStandardMaterial color="#ffffff" roughness={0.74} metalness={0} />
        </mesh>
        <instancedMesh ref={jobLines} args={[undefined, undefined, JOB_LINES]} frustumCulled={false}>
          <planeGeometry args={[1, 0.03]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
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

export function ScanScene({ stage, className }: { stage: Stage; className?: string }) {
  const enabled = useClientValue(canRender, false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (!enabled) return null;

  return (
    <div className={className} aria-hidden>
      <Canvas
        flat
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 4.6], fov: 38, near: 0.1, far: 20 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={reduced ? "demand" : "always"}
      >
        <ambientLight intensity={1.15} />
        <hemisphereLight args={["#ffffff", "#d2d2cc", 0.55]} />
        <directionalLight position={[2, 3.5, 5]} intensity={2.6} />
        <directionalLight position={[-3, 1, 3]} intensity={0.7} />
        <Sheets stage={stage} motion={reduced ? 0 : 1} />
      </Canvas>
    </div>
  );
}
