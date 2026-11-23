"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";
import type { RuleResult } from "@/lib/types";

/**
 * The score, with its working drawn around it.
 *
 * The old dial was one continuous arc: a single number, and nothing to check
 * it against. This draws one segment per requirement the post actually names —
 * wide for an essential, narrow for a nice-to-have, filled teal when the CV
 * answers it, half-filled when it half does, hollow when it does not. The
 * figure in the middle is then a summary of something visible rather than a
 * verdict out of nowhere.
 *
 * Segments light in sequence on first reveal, which is the measurement being
 * taken. Hovering one names it. With no breakdown to draw it falls back to a
 * plain arc, because a ring of one segment is a lie about how the score works.
 */

interface Props {
  /** Where the needle ends up, 0–100. */
  value: number;
  /** What it was before any changes; drawn as a ghost tick. */
  baseline?: number;
  /** One segment per rule. Omit for the plain arc. */
  rules?: RuleResult[] | null;
  size?: number;
  label?: string;
  /** Skip the reveal. For a score being updated rather than announced. */
  instant?: boolean;
  className?: string;
}

const GAP_DEG = 2.4;
const ESSENTIAL_WEIGHT = 1;
const WISH_WEIGHT = 0.55;

const TONE: Record<string, { fill: string; track: string }> = {
  covered: { fill: "var(--color-signal)", track: "var(--color-signal)" },
  partial: { fill: "var(--color-amber)", track: "var(--color-amber)" },
  missing: { fill: "transparent", track: "var(--color-hairline)" },
};

/**
 * Polar to cartesian, with 12 o'clock as zero.
 *
 * Rounded to three decimals on purpose. Node and the browser disagree about
 * the last bit of `Math.cos`, so the path the server rendered and the path
 * the client computed differed at the fifteenth digit — a hydration mismatch
 * on every page that drew a ring. A thousandth of a pixel is below anything
 * a screen can show, and it makes both sides emit the same string.
 */
function point(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return [round(cx + r * Math.cos(rad)), round(cy + r * Math.sin(rad))] as const;
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = point(cx, cy, r, from);
  const [x2, y2] = point(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function ScoreRing({
  value,
  baseline,
  rules = null,
  size = 168,
  label = "requirements met",
  instant = false,
  className,
}: Props) {
  const still = useReducedMotion();
  const numberRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const segRefs = useRef<Array<SVGPathElement | null>>([]);
  const arcRef = useRef<SVGPathElement | null>(null);

  const stroke = Math.max(6, size * 0.055);
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  /** Each rule's slice of the circle, weighted the way the score weights it. */
  const segments = useMemo(() => {
    if (!rules || rules.length === 0) return null;
    const total = rules.reduce((sum, rule) => sum + (rule.essential ? ESSENTIAL_WEIGHT : WISH_WEIGHT), 0);
    if (total <= 0) return null;
    let cursor = 0;
    return rules.map((rule) => {
      const weight = rule.essential ? ESSENTIAL_WEIGHT : WISH_WEIGHT;
      const span = (weight / total) * 360;
      const from = cursor + GAP_DEG / 2;
      const to = cursor + span - GAP_DEG / 2;
      cursor += span;
      return { rule, from, to: Math.max(to, from + 0.6) };
    });
  }, [rules]);

  const circumference = 2 * Math.PI * r;

  // The number counts; the segments light in order behind it.
  useEffect(() => {
    const target = Math.max(0, Math.min(100, value));
    const from = shown.current;
    shown.current = target;

    const paintNumber = (n: number) => {
      if (numberRef.current) numberRef.current.textContent = String(Math.round(n));
    };
    const paintArc = (n: number) => {
      if (arcRef.current) arcRef.current.style.strokeDashoffset = String(circumference * (1 - n / 100));
    };

    if (still || instant) {
      paintNumber(target);
      paintArc(target);
      segRefs.current.forEach((el) => el && (el.style.opacity = "1"));
      return;
    }

    const distance = Math.abs(target - from);
    const controls = animate(from, target, {
      duration: Math.min(0.4 + distance * 0.018, 1.6),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => {
        paintNumber(n);
        paintArc(n);
      },
    });

    const timers = segRefs.current.map((el, i) =>
      el
        ? window.setTimeout(() => {
            el.style.opacity = "1";
            el.style.transform = "scale(1)";
          }, 120 + i * 55)
        : 0,
    );

    return () => {
      controls.stop();
      timers.forEach(clearTimeout);
    };
  }, [value, circumference, still, instant]);

  const moved = baseline === undefined ? 0 : Math.round(value - baseline);

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} role="img" aria-label={`${Math.round(value)} per cent, ${label}`}>
        {segments ? (
          <g>
            {segments.map(({ rule, from, to }, i) => {
              const tone = TONE[rule.status] ?? TONE.missing;
              const half = rule.status === "partial";
              return (
                <g key={rule.id || i}>
                  {/* The track: every requirement is drawn whether or not it is
                      met, because the ones that are missing are the point. */}
                  <path
                    d={arcPath(cx, cy, r, from, to)}
                    fill="none"
                    stroke={rule.status === "missing" ? "var(--color-hairline)" : tone.track}
                    strokeOpacity={rule.status === "missing" ? 1 : 0.22}
                    strokeWidth={rule.essential ? stroke : stroke * 0.5}
                    strokeLinecap="round"
                  />
                  {rule.status !== "missing" && (
                    <path
                      ref={(el) => {
                        segRefs.current[i] = el;
                      }}
                      d={arcPath(cx, cy, r, from, half ? from + (to - from) / 2 : to)}
                      fill="none"
                      stroke={tone.fill}
                      strokeWidth={rule.essential ? stroke : stroke * 0.5}
                      strokeLinecap="round"
                      style={{
                        opacity: still || instant ? 1 : 0,
                        transition: "opacity 420ms cubic-bezier(0.22,1,0.36,1)",
                      }}
                    >
                      <title>{rule.requirement}</title>
                    </path>
                  )}
                </g>
              );
            })}
          </g>
        ) : (
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
            <circle
              ref={arcRef as unknown as React.RefObject<SVGCircleElement>}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--color-signal)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference}
            />
          </g>
        )}

        {/* Where it started. A score with nothing to be better than means
            nothing once the editing begins. */}
        {baseline !== undefined && baseline > 0 && baseline !== value && (
          <g transform={`rotate(${(baseline / 100) * 360} ${cx} ${cy})`}>
            <line
              x1={cx}
              y1={cy - r - stroke * 0.75}
              x2={cx}
              y2={cy - r + stroke * 0.75}
              stroke="var(--color-slate)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.5}
            />
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display font-semibold leading-none tracking-[-0.04em] text-ink" data-numeric>
            <span ref={numberRef} style={{ fontSize: size * 0.3 }}>
              0
            </span>
            <span className="text-slate" style={{ fontSize: size * 0.14 }}>
              %
            </span>
          </div>
          {moved !== 0 && (
            <p
              className={cn(
                "pt-1 font-display text-2xs font-semibold",
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
