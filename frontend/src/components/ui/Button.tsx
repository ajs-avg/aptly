"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "applied";
type Size = "sm" | "md" | "lg";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/*
 * Pills, in the landing page's hand. The primary action carries the teal's
 * own glow and lifts a pixel on hover; the secondary is paper on paper with a
 * soft edge; the ghost is text until you reach it. Nothing bounces.
 */
const VARIANTS: Record<Variant, string> = {
  // The primary is ink on paper — on the dark product that is a white pill,
  // which is the one thing on a near-black screen you cannot miss. Teal is
  // kept for state (verified, applied), not for buttons.
  primary:
    "bg-ink text-paper hover:opacity-90 hover:-translate-y-px " +
    "active:translate-y-0 disabled:opacity-40 disabled:translate-y-0",
  secondary:
    "bg-white/[0.06] text-ink ring-1 ring-hairline hover:bg-white/[0.1] " +
    "disabled:text-slate/50",
  ghost: "text-slate hover:text-ink hover:bg-white/[0.06]",
  // The design doc's rule: an action keeps its name through the whole flow, so
  // "Apply" becomes "Applied" rather than vanishing or turning into a tick.
  applied: "bg-signal-soft text-signal ring-1 ring-signal/20 cursor-default",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-2xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "secondary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-pill font-display font-medium tracking-[-0.01em]",
        "transition-[background-color,color,box-shadow,transform] duration-200 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
