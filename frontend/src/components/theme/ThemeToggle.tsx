"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "./ThemeProvider";

/**
 * Three states, shown as three, because two would be a lie.
 *
 * A two-way switch cannot express "follow my device", which is what most people
 * want and what this defaults to. Collapsing it would mean somebody's phone
 * going dark at sunset while this page stayed white, with no control that
 * explains why.
 *
 * The selected pill is one shared `layoutId`, so the marker slides between
 * options rather than disappearing and reappearing somewhere else.
 */

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "system", label: "Follow device", icon: <DeviceIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { choice, set } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-pill border border-hairline bg-raised/80 p-0.5 backdrop-blur-sm",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => set(option.value)}
            className={cn(
              "relative grid size-7 place-items-center rounded-pill transition-colors duration-200",
              active ? "text-signal" : "text-slate hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-marker"
                className="absolute inset-0 rounded-pill bg-signal-soft"
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
              />
            )}
            <span className="relative">{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Icons are inline and stroke-based so they inherit `currentColor` and stay
   crisp at 14px. An icon font or an SVG sprite would be a network request for
   three shapes. */

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5">
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
      />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path strokeLinecap="round" d="M8 20h8" />
    </svg>
  );
}
