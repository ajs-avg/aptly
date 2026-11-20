"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * The product's drawings.
 *
 * One object runs through all of them — a sheet of paper with lines on it —
 * because that is the one object the product has. An empty screen that says
 * only "No applications yet" is a dead end; these give the eye something and
 * the sentence beside them something to point at.
 *
 * Everything is inline SVG on `currentColor` and the theme tokens, so a drawing
 * is correct in both themes, sharp at any size, and weighs nothing.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/** An empty Library: a sheet, filed, and a phone that has not rung yet. */
export function EmptyLibraryArt({ className }: { className?: string }) {
  const still = useReducedMotion();
  return (
    <svg viewBox="0 0 220 150" className={cn("h-auto w-full", className)} role="img" aria-label="An empty shelf of applications">
      <defs>
        <linearGradient id="lib-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--color-signal)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="110" cy="132" rx="72" ry="7" fill="var(--color-ink)" opacity="0.05" />

      {/* Three filed sheets, the back two faded: a Library that could be. */}
      {[
        { x: 56, y: 36, o: 0.35, r: -7 },
        { x: 72, y: 30, o: 0.6, r: -3 },
      ].map((sheet, i) => (
        <g key={i} transform={`rotate(${sheet.r} ${sheet.x + 32} ${sheet.y + 45})`} opacity={sheet.o}>
          <rect x={sheet.x} y={sheet.y} width="64" height="90" rx="7" fill="var(--color-raised)" stroke="var(--color-hairline)" strokeWidth="1.5" />
        </g>
      ))}

      <motion.g
        initial={still ? false : { y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <rect x="88" y="26" width="66" height="94" rx="7" fill="var(--color-raised)" stroke="var(--color-hairline)" strokeWidth="1.5" />
        <rect x="88" y="26" width="66" height="94" rx="7" fill="url(#lib-fade)" />
        {[40, 52, 64, 76, 88, 100].map((y, i) => (
          <rect
            key={y}
            x="99"
            y={y}
            width={i === 0 ? 30 : i % 3 === 0 ? 44 : 36}
            height="3.5"
            rx="1.75"
            fill={i === 0 ? "var(--color-slate)" : "var(--color-hairline)"}
          />
        ))}
      </motion.g>

      {/* The phone, ringing in the future tense. */}
      <motion.g
        initial={still ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
        style={{ transformOrigin: "176px 46px" }}
      >
        <circle cx="176" cy="46" r="17" fill="var(--color-signal-soft)" />
        <path
          d="M170 41.5c0-1.4 1.1-2.5 2.5-2.5h1.6c.6 0 1.1.4 1.2 1l.6 2.6c.1.5-.1 1-.5 1.3l-1.1.8a9.5 9.5 0 0 0 4 4l.8-1.1c.3-.4.8-.6 1.3-.5l2.6.6c.6.1 1 .6 1 1.2V50a2.5 2.5 0 0 1-2.5 2.5A11.5 11.5 0 0 1 170 41.5Z"
          fill="var(--color-signal)"
        />
        {!still &&
          [0, 1].map((i) => (
            <motion.circle
              key={i}
              cx="176"
              cy="46"
              r="17"
              fill="none"
              stroke="var(--color-signal)"
              strokeWidth="1.5"
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: "easeOut" }}
              style={{ transformOrigin: "176px 46px" }}
            />
          ))}
      </motion.g>
    </svg>
  );
}

/** An empty profile: a sheet half-written, waiting for the rest. */
export function EmptyProfileArt({ className }: { className?: string }) {
  const still = useReducedMotion();
  return (
    <svg viewBox="0 0 200 140" className={cn("h-auto w-full", className)} role="img" aria-label="A profile waiting to be filled in">
      <ellipse cx="100" cy="124" rx="60" ry="6" fill="var(--color-ink)" opacity="0.05" />
      <rect x="62" y="20" width="76" height="100" rx="8" fill="var(--color-raised)" stroke="var(--color-hairline)" strokeWidth="1.5" />
      {[34, 46, 58, 70, 82, 94, 106].map((y, i) => {
        const filled = i < 3;
        return (
          <motion.rect
            key={y}
            x="75"
            y={y}
            width={i === 0 ? 34 : i % 2 === 0 ? 50 : 40}
            height="4"
            rx="2"
            fill={filled ? "var(--color-signal)" : "var(--color-hairline)"}
            opacity={filled ? 0.85 : 1}
            initial={still ? false : { scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.1 + i * 0.07 }}
            style={{ transformOrigin: "75px center" }}
          />
        );
      })}
      <circle cx="146" cy="100" r="15" fill="var(--color-amber-soft)" />
      <path d="M146 92v16M138 100h16" stroke="var(--color-amber-ink)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** A record with nothing selected: pick one. */
export function NothingSelectedArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 120" className={cn("h-auto w-full", className)} role="img" aria-label="Pick an application">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x="24"
          y={22 + i * 28}
          width={i === 1 ? 90 : 70}
          height="16"
          rx="8"
          fill={i === 1 ? "var(--color-signal-soft)" : "var(--color-sunken)"}
          stroke={i === 1 ? "var(--color-signal)" : "transparent"}
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
      ))}
      <path
        d="M128 54c6-10 18-14 28-10"
        stroke="var(--color-slate)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="3 4"
        opacity="0.6"
      />
      <path d="M124 48l-2 10 10-3z" fill="var(--color-slate)" opacity="0.6" />
    </svg>
  );
}

/** Nothing matched a search. */
export function NoMatchArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={cn("h-auto w-full", className)} role="img" aria-label="Nothing matched">
      <circle cx="70" cy="48" r="26" fill="none" stroke="var(--color-hairline)" strokeWidth="3" />
      <path d="M89 67l18 18" stroke="var(--color-hairline)" strokeWidth="3" strokeLinecap="round" />
      <path d="M62 48h16" stroke="var(--color-slate)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
