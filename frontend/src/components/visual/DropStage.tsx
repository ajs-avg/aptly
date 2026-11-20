"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useClientValue, useMediaQuery } from "@/lib/browser";

/**
 * The sheet waiting to be given something.
 *
 * It sits behind the first screen and answers the pointer — a slow tilt
 * toward the cursor, a lift when a file is dragged over the page. Empty it
 * holds faint rules; once a CV is in the box it fills with lines, which is the
 * one piece of feedback the old screen never gave: nothing on it changed when
 * you pasted two thousand words into a textarea.
 *
 * Decoration with a job, then, and strictly decoration: nothing here is
 * clickable, and the real control is the box in front of it.
 */

const W = 1.24;
const H = 1.74;
const LINES = 12;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

const SPEC = (() => {
  const rand = mulberry32(5);
  const top = H / 2 - 0.2;
  const gap = (H - 0.42) / (LINES - 1);
  return Array.from({ length: LINES }, (_, i) => ({
    y: top - i * gap,
    w: i === 0 ? 0.5 : 0.28 + rand() * 0.6,
    head: i === 0 || i === 5,
  }));
})();

const EMPTY = new THREE.Color("#e6e6e2");
const INK = new THREE.Color("#c8cbd1");
const HEAD = new THREE.Color("#8d9099");

function Sheet({ filled, active, motion }: { filled: boolean; active: boolean; motion: number }) {
  const group = useRef<THREE.Group>(null);
  const lines = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const pointer = useRef({ x: 0, y: 0 });
  const fill = useRef(0);
  const lift = useRef(0);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    const mesh = lines.current;
    if (!g || !mesh) return;

    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-delta * 3.2);
    fill.current = lerp(fill.current, filled ? 1 : 0, 1 - Math.exp(-delta * 2.6));
    lift.current = lerp(lift.current, active ? 1 : 0, k);

    const tx = pointer.current.x * 0.26 * motion;
    const ty = pointer.current.y * 0.18 * motion;
    g.rotation.x = lerp(g.rotation.x, 0.1 - ty + Math.sin(t * 0.5) * 0.015 * motion, k);
    g.rotation.y = lerp(g.rotation.y, -0.3 + tx + Math.sin(t * 0.4) * 0.02 * motion, k);
    g.position.y = lerp(g.position.y, Math.sin(t * 0.75) * 0.03 * motion + lift.current * 0.14, k);
    g.scale.setScalar(lerp(g.scale.x, 1 + lift.current * 0.04, k));

    for (let i = 0; i < LINES; i++) {
      const line = SPEC[i];
      // Lines arrive top-down as the box fills, so pasting a CV reads as the
      // page receiving it rather than as a number changing somewhere.
      const arrive = clamp01(fill.current * LINES - i);
      const w = Math.max(line.w * (0.22 + 0.78 * arrive), 0.0001);
      o.position.set(-W / 2 + 0.13 + w / 2, line.y, 0.011);
      o.rotation.set(0, 0, 0);
      o.scale.set(w, line.head ? 1.4 : 1, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      c.copy(EMPTY).lerp(line.head ? HEAD : INK, arrive);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh position={[0.08, -0.16, -0.2]} renderOrder={-1}>
        <planeGeometry args={[W * 1.6, H * 1.35]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.045} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -0.003]}>
        <planeGeometry args={[W + 0.014, H + 0.014]} />
        <meshBasicMaterial color="#dededa" toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[W, H, 0.015]} />
        <meshStandardMaterial color="#ffffff" roughness={0.74} metalness={0} />
      </mesh>
      <instancedMesh ref={lines} args={[undefined, undefined, LINES]} frustumCulled={false}>
        <planeGeometry args={[1, 0.032]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
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

export function DropStage({
  filled,
  active = false,
  className,
}: {
  /** True once there is a CV in the box. */
  filled: boolean;
  /** True while a file is over the page. */
  active?: boolean;
  className?: string;
}) {
  const enabled = useClientValue(canRender, false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const small = useMediaQuery("(max-width: 720px)");

  // On a phone the boxes fill the screen and there is nothing behind them to
  // see; the canvas would be a battery cost with no picture.
  if (!enabled || small) return null;

  return (
    <div className={className} aria-hidden>
      <Canvas
        flat
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 4.4], fov: 38, near: 0.1, far: 20 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={reduced ? "demand" : "always"}
      >
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#ffffff", "#d4d4ce", 0.5]} />
        <directionalLight position={[2, 3.5, 5]} intensity={2.5} />
        <directionalLight position={[-3, 1, 3]} intensity={0.65} />
        <Sheet filled={filled} active={active} motion={reduced ? 0 : 1} />
      </Canvas>
    </div>
  );
}
