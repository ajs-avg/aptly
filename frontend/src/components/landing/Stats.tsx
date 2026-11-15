"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

/**
 * Four figures along the bottom of the first screen.
 *
 * Every one of them is a fact about the product as built, not a claim about
 * its users: how long a score takes, how many checks a suggestion passes, how
 * many formats come back as they went in, and what share of suggestions is
 * verified before it is shown. They count up once, when they come into view.
 */
const STATS = [
  { target: 60, suffix: "s", label: "From drop to score" },
  { target: 7, suffix: "", label: "Checks on every suggestion" },
  { target: 5, suffix: "", label: "File formats, kept" },
  { target: 100, suffix: "%", label: "Suggestions verified" },
];

const DELAYS = [0.55, 0.62, 0.69, 0.76];

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function Stats() {
  const root = useRef<HTMLDivElement>(null);
  const values = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frames: number[] = [];
    const timers: number[] = [];
    let done = false;

    const paint = (i: number, value: number) => {
      const span = values.current[i];
      if (!span) return;
      span.textContent = `${Math.round(value)}${STATS[i].suffix}`;
    };

    const run = () => {
      if (done) return;
      done = true;
      STATS.forEach((stat, i) => {
        if (reduced) {
          paint(i, stat.target);
          return;
        }
        const duration = 1400 + i * 80;
        const start = 600 + i * 90;
        timers.push(
          window.setTimeout(() => {
            const t0 = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - t0) / duration);
              paint(i, stat.target * easeOutCubic(p));
              if (p < 1) frames.push(requestAnimationFrame(tick));
            };
            frames.push(requestAnimationFrame(tick));
          }, start),
        );
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
    };
  }, []);

  return (
    <div ref={root} className={styles.stats}>
      {STATS.map((stat, i) => (
        <div
          key={stat.label}
          className={cn(styles.stat, styles.anim)}
          style={{ "--d": `${DELAYS[i]}s` } as React.CSSProperties}
        >
          <span
            className={cn(styles.statValue, styles.display)}
            ref={(node) => {
              values.current[i] = node;
            }}
          >
            {`0${stat.suffix}`}
          </span>
          <span className={styles.statLabel}>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
