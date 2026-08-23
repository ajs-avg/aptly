"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";

import { useClientValue, useMediaQuery } from "@/lib/browser";
import { Scene } from "./Scene";
import { POSE_IDS } from "./poses";
import { applySceneTheme } from "./paper";
import { readSceneTheme } from "./theme";

/**
 * The 3D layer, fixed behind the page.
 *
 * Deliberately *not* drei's `ScrollControls`, which moves the page's content
 * inside the canvas. This page has to rank, and text inside a WebGL wrapper is
 * client-rendered only. So the content stays ordinary server-rendered HTML and
 * the canvas sits behind it.
 *
 * The scene's position in its story comes from measuring the sections
 * themselves rather than from a fraction of total page height. Those two agree
 * only by luck: adding a paragraph anywhere shifts every hand-tuned fraction,
 * and the scene silently falls out of step with the words it is illustrating.
 */
export function StoryCanvas() {
  /** Raw, from the scroll listener. Jittery by nature — see `Smoothing`. */
  const targetRef = useRef(0);
  /** Damped, and what the scene actually reads. */
  const stageRef = useRef(0);

  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const enabled = useClientValue(canRender, false);

  // A string, not the theme object: `useSyncExternalStore` compares snapshots
  // by identity, and `readSceneTheme` allocates fresh THREE.Color instances on
  // every call — returning it directly would re-render without end.
  const themeKey = useSyncExternalStore(subscribeToTheme, readThemeKey, () => "light");
  const theme = useMemo(() => {
    const next = readSceneTheme(themeKey);
    applySceneTheme(next);
    return next;
  }, [themeKey]);

  useEffect(() => {
    let sections: HTMLElement[] = [];

    const measure = () => {
      sections = POSE_IDS.map((id) =>
        document.querySelector<HTMLElement>(`[data-scene="${id}"]`),
      ).filter((element): element is HTMLElement => element !== null);
      update();
    };

    /**
     * Which section is under the middle of the viewport, and how far through it.
     *
     * Written to a ref, never to state: this runs on every frame of a scroll,
     * and re-rendering a React tree that often would cost more than the scene.
     */
    const update = () => {
      if (sections.length === 0) return;
      const centre = window.scrollY + window.innerHeight / 2;

      if (centre <= sections[0].offsetTop) {
        targetRef.current = 0;
        return;
      }

      for (let index = 0; index < sections.length; index += 1) {
        const element = sections[index];
        const top = element.offsetTop;
        const height = element.offsetHeight || 1;

        if (centre < top + height) {
          // A pose belongs to the *middle* of its section, not its top edge.
          // Offsetting by half means the scene is fully in position exactly
          // when you are reading that section, and spends the boundaries
          // travelling between neighbours — rather than arriving a whole
          // section late, which left every pose half-applied.
          targetRef.current = index + (centre - top) / height - 0.5;
          return;
        }
      }

      targetRef.current = sections.length - 1;
    };

    measure();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", measure, { passive: true });

    // Fonts and images change section heights after first paint, so the
    // measurements have to be retaken once the page settles.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  /**
   * How much resolution to spend.
   *
   * A phone at 3× renders nine times the pixels of a 1× display for a
   * background nobody inspects, and it is exactly the hardware least able to
   * afford it. The floor stays at 1 so the ceiling never drops below native on
   * a plain display.
   */
  const dpr = useMemo<[number, number]>(() => {
    if (typeof window === "undefined") return [1, 1.5];
    return window.innerWidth < 768 ? [1, 1.25] : [1, 1.6];
  }, []);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      // z-0, never negative: an element behind the root stacking context paints
      // underneath the body background, which hides the scene completely while
      // every other sign of life says it is working.
      className="pointer-events-none fixed inset-0 z-0"
    >
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0.1, 5.4], fov: 42, near: 0.1, far: 60 }}
        // The scene is decoration behind a document. It must never keep a
        // laptop's fans running once the reader has stopped scrolling, and it
        // must never delay the page's own work.
        frameloop={reduced ? "demand" : "always"}
      >
        <Scene stageRef={stageRef} targetRef={targetRef} reduced={reduced} theme={theme} />
      </Canvas>
    </div>
  );
}

/**
 * Fires when the palette changes, from either direction.
 *
 * The OS setting is a media query; an explicit choice is an attribute on
 * <html>, which no media query can observe. Both have to be watched or the
 * scene keeps the palette it started with — lit for a page that has since gone
 * dark.
 */
function subscribeToTheme(notify: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", notify);

  const watcher = new MutationObserver(notify);
  watcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => {
    media.removeEventListener("change", notify);
    watcher.disconnect();
  };
}

function readThemeKey(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("color-scheme").trim();
}

/**
 * Can this browser draw the scene at all?
 *
 * Only WebGL support is tested. An earlier version also refused below four
 * cores and 4 GB — a reasonable-sounding heuristic that silently disabled the
 * scene on hardware that handled it fine, and gave no clue why. Cost is
 * controlled where it belongs instead: a capped pixel ratio, shared geometry
 * and materials, no per-frame React work, and a full stop for reduced motion.
 */
function canRender(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}
