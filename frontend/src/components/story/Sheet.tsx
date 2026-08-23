"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";

import {
  CV_LINES,
  SHEET_DEPTH,
  amberMaterial,
  amberWashMaterial,
  clamp,
  lineGeometry,
  materialFor,
  paperMaterial,
  sheetGeometry,
} from "./paper";

interface Props {
  /**
   * 0 → nothing marked, 1 → every marked line highlighted, staggered.
   *
   * A ref rather than a prop so the marks can animate without re-rendering:
   * this sheet is on screen for a third of the page's scroll, and re-rendering
   * a React tree on every frame of that is work nobody sees.
   */
  marking?: React.MutableRefObject<number>;
  printed?: boolean;
}

/**
 * One sheet of paper, printed like a CV.
 *
 * The printed lines are flat planes floated a hair above the face rather than a
 * texture: they stay crisp at any zoom, cost nothing to author, and let
 * individual lines animate — which is the point, because the amber marks
 * arriving one by one *is* the story beat.
 */
export function Sheet({ marking, printed = true }: Props) {
  const marked = useMemo(() => CV_LINES.filter((line) => line.marked), []);
  const washes = useRef<(THREE.Mesh | null)[]>([]);
  const bars = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const progress = marking?.current ?? 0;

    marked.forEach((line, index) => {
      // Each mark lands a beat after the one above it, so the eye follows the
      // page downward the way a reader would.
      const t = clamp(progress * marked.length - index, 0, 1);
      const height = line.height * 2.6;

      const wash = washes.current[index];
      if (wash) {
        wash.scale.set(Math.max(0.78 * t, 0.0001), height, 1);
        wash.position.x = -0.38 + (0.78 * t) / 2;
        wash.visible = t > 0.001;
      }

      const bar = bars.current[index];
      if (bar) {
        bar.scale.set(0.008, Math.max(height * t, 0.0001), 1);
        bar.visible = t > 0.001;
      }
    });
  });

  return (
    <group>
      <mesh
        geometry={sheetGeometry}
        material={paperMaterial}
        castShadow
        receiveShadow
      />

      {printed && (
        <group position={[0, 0, SHEET_DEPTH / 2 + 0.0004]}>
          {/* The highlighter wash sits under the text it marks. */}
          {marked.map((line, index) => (
            <mesh
              key={`wash-${index}`}
              ref={(mesh) => {
                washes.current[index] = mesh;
              }}
              geometry={lineGeometry}
              material={amberWashMaterial}
              position={[-0.38, line.y * 1.414, 0.0001]}
              visible={false}
            />
          ))}

          {CV_LINES.map((line, index) => (
            <mesh
              key={index}
              geometry={lineGeometry}
              material={materialFor(line.kind)}
              // Left-aligned on the page, so only the width varies — which is
              // what makes ragged right edges read as text rather than bars.
              position={[-0.38 + line.width / 2, line.y * 1.414, 0.0002]}
              scale={[line.width, line.height, 1]}
            />
          ))}

          {/* The editor's rule down the left of each changed line. */}
          {marked.map((line, index) => (
            <mesh
              key={`bar-${index}`}
              ref={(mesh) => {
                bars.current[index] = mesh;
              }}
              geometry={lineGeometry}
              material={amberMaterial}
              position={[-0.385, line.y * 1.414, 0.0003]}
              visible={false}
            />
          ))}
        </group>
      )}
    </group>
  );
}
