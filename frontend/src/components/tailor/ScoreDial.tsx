"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * The match figure, counting to where it belongs.
 *
 * The number is the first honest thing this product says, and it is often bad
 * news — 27%, 18%, sometimes lower. A dial that snaps straight to a low figure
 * reads as a verdict; one that counts up reads as a measurement being taken,
 * which is what it is. The animation is not decoration, it is the difference
 * between being judged and being told.
 *
 * Driven imperatively rather than through React state: this ticks sixty times a
 * second, and re-rendering a tree that often to move one number is the kind of
 * thing that makes a page feel heavy for no reason the user can see.
 */

interface Props {
  /** Where the dial should end up, 0–100. */
  value: number;
  /** What it was before any changes, drawn as a ghost mark on the arc. */
  baseline?: number;
  size?: number;
  label?: string;
  /** Skip the count-up. For a score that is being updated, not revealed. */
  instant?: boolean;
  className?: string;
}

const STROKE = 7;

export function ScoreDial({
  value,
  baseline,
  size = 132,
  label,
  instant = false,
  className,
}: Props) {
  const still = useReducedMotion();
  const numberRef = useRef<HTMLSpanElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const shown = useRef(0);

  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const target = Math.max(0, Math.min(100, value));
    const from = shown.current;
    shown.current = target;

    const paint = (n: number) => {
      if (numberRef.current) numberRef.current.textContent = String(Math.round(n));
      if (arcRef.current) {
        arcRef.current.style.strokeDashoffset = String(circumference * (1 - n / 100));
      }
    };

    if (still || instant) {
      paint(target);
      return;
    }

    // Slower for a bigger jump, but never long enough to be a wait. The first
    // reveal travels from zero and earns its second; a live update after an
    // edit moves a point or two and must feel immediate.
    const distance = Math.abs(target - from);
    const controls = animate(from, target, {
      duration: Math.min(0.35 + distance * 0.016, 1.5),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: paint,
    });
    return () => controls.stop();
  }, [value, circumference, still, instant]);

  const moved = baseline === undefined ? 0 : value - baseline;

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth={STROKE}
        />
        {/* Where it started, as a notch. Without it the current number has
            nothing to be better than, which is the only thing it means. */}
        {baseline !== undefined && baseline > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-slate)"
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={`2 ${circumference}`}
            strokeDashoffset={-circumference * (baseline / 100)}
            opacity={0.55}
          />
        )}
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display font-semibold leading-none text-ink" data-numeric>
            <span ref={numberRef} style={{ fontSize: size * 0.29 }}>
              0
            </span>
            <span className="text-slate" style={{ fontSize: size * 0.15 }}>
              %
            </span>
          </div>
          {label && (
            <p className="pt-1 font-display text-2xs uppercase tracking-[0.1em] text-slate">
              {label}
            </p>
          )}
          {moved !== 0 && (
            <p
              className={cn(
                "pt-0.5 font-display text-2xs font-medium",
                moved > 0 ? "text-signal" : "text-danger",
              )}
              data-numeric
            >
              {moved > 0 ? "+" : ""}
              {moved}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
