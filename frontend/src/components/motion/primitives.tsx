"use client";

import type { ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Motion's own `children` is widened to accept a MotionValue, which is useful
 * for animating a number into a text node and useless here — it only means
 * every caller passing ordinary JSX has to be narrowed by hand. Taken back to
 * plain React children, and `variants` is removed because these components own
 * theirs.
 */
type Props = Omit<HTMLMotionProps<"div">, "children" | "variants"> & {
  children?: ReactNode;
};

/**
 * The product's motion vocabulary, in one place.
 *
 * Two rules hold everything here together.
 *
 * **Nothing bounces for decoration.** This is a tool people use while anxious
 * about a job. A spring that overshoots reads as playful on a landing page and
 * as instability on a screen showing your employment history, so the springs
 * below are tuned to settle without ringing — high stiffness, damping near
 * critical.
 *
 * **Transform and opacity only.** Animating width, height, top or margin makes
 * the browser re-run layout on every frame of every animation, and that is what
 * "not smooth" nearly always turns out to be. Everything here compiles to a
 * composited transform.
 *
 * Every component honours `prefers-reduced-motion` by rendering the *finished*
 * state immediately — never by playing a faster version of the same thing.
 */

/** For anything that travels: cards arriving, panels opening. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 34,
  mass: 0.8,
};

/** Softer, for larger objects where a fast settle looks twitchy. */
export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 30,
  mass: 1,
};

/** For fades and colour, where a spring has nothing to settle. */
export const EASE: Transition = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
};

export const EASE_QUICK: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

/* ═══════════════════════════════════════════════════════════════════════════
   Arriving on scroll
   ═══════════════════════════════════════════════════════════════════════════ */

interface RevealProps extends Props {
  /** Seconds to wait after the element qualifies. Use sparingly. */
  delay?: number;
  /** How far it travels in, in pixels. Small is the point. */
  distance?: number;
}

/**
 * Content that arrives as you reach it.
 *
 * `once: true` is not a performance nicety — re-animating on every pass makes a
 * page feel unstable when you scroll back to check something, which on this
 * product is a thing people do constantly.
 *
 * The margin fires the animation slightly *before* the element reaches the
 * viewport edge, so it is already settling by the time it is properly readable
 * rather than starting to move once you are looking at it.
 */
export function Reveal({
  delay = 0,
  distance = 14,
  className,
  children,
  ...rest
}: RevealProps) {
  const still = useReducedMotion();

  if (still) {
    return (
      <div className={className} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ ...EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Groups
   ═══════════════════════════════════════════════════════════════════════════ */

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: EASE },
};

/**
 * A list whose children arrive in sequence.
 *
 * The stagger is 55ms — enough to read as one thing after another, short enough
 * that the last of six items is not still arriving half a second after you
 * looked at it. Anything longer and the reader is waiting for the interface.
 */
export function Stagger({ className, children, ...rest }: Props) {
  const still = useReducedMotion();

  if (still) {
    return (
      <div className={className} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...rest }: Props) {
  const still = useReducedMotion();

  if (still) {
    return (
      <div className={className} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div className={className} variants={item} {...rest}>
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Interaction
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A surface that responds to being touched.
 *
 * The press is larger than the lift, deliberately: a control should acknowledge
 * a press unmistakably, while hover is a hint and should stay near the
 * threshold of noticing. On a touch screen there is no hover at all, and the
 * press is the entire feedback — which is why it is the bigger of the two.
 */
export function Pressable({
  className,
  children,
  lift = -2,
  ...rest
}: Props & { lift?: number }) {
  const still = useReducedMotion();

  return (
    <motion.div
      className={cn("will-change-transform", className)}
      whileHover={still ? undefined : { y: lift }}
      whileTap={still ? undefined : { scale: 0.985 }}
      transition={SPRING}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
