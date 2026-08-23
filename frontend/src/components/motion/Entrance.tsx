"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";

/**
 * The hero's arrival, on load rather than on scroll.
 *
 * Everything below the fold uses `Reveal`, which waits until you reach it. The
 * hero cannot: it is already on screen when the page appears, so a
 * scroll-triggered fade would either fire instantly — making the animation
 * pointless — or, worse, leave the headline at zero opacity while somebody is
 * looking straight at it.
 *
 * The order is eyebrow → headline → lede → button, each 70ms behind the last.
 * That is the order the sentence is read in, so the motion follows the reading
 * rather than competing with it. Total settle is under half a second; a hero
 * that is still assembling itself after that is making the visitor wait to find
 * out what the product does.
 */

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.06 } },
};

const line: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Entrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={group} initial="hidden" animate="shown">
      {children}
    </motion.div>
  );
}

export function EntranceLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={line}>
      {children}
    </motion.div>
  );
}
