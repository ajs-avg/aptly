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
 * Radii are small and shadows are shallow on purpose. This is a tool people
 * open when they are nervous about a job application; it should read as precise
 * rather than playful.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-signal text-paper hover:bg-signal-hover active:translate-y-px " +
    "shadow-raised disabled:bg-slate/40 disabled:shadow-none",
  secondary:
    "bg-raised text-ink ring-1 ring-hairline hover:bg-sunken active:translate-y-px " +
    "disabled:text-slate/50",
  ghost: "text-slate hover:text-ink hover:bg-sunken",
  // The design doc's rule: an action keeps its name through the whole flow, so
  // "Apply" becomes "Applied" rather than vanishing or turning into a tick.
  applied: "bg-signal-soft text-signal ring-1 ring-signal/20 cursor-default",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-2xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
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
        "inline-flex items-center justify-center rounded-pill font-display font-medium",
        "transition-[background-color,color,box-shadow,transform] duration-150",
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
