import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The motion vocabulary, in one place.
 *
 * The design doc asks for calm and quick. That means short durations, a single
 * easing curve, and movement that has a reason — a change card travels *toward*
 * the CV when applied, because that is where its content went. Nothing bounces
 * for decoration.
 */
export const motionTokens = {
  quick: 0.18,
  base: 0.26,
  slow: 0.42,
  /** Matches --ease-out-quiet in globals.css. */
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
  /** For the one physical object in the product: the Recruiter-Ready Card. */
  spring: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const,
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
