"use client";

import Link from "next/link";
import { motion as m, useMotionValue, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { useMediaQuery } from "@/lib/browser";
import { cn } from "@/lib/utils";
import { CvScene } from "./CvScene";
import styles from "./landing.module.css";

/**
 * The first four screens of the page, pinned.
 *
 * The section is four viewports tall and its child sticks for three of them,
 * so scrolling moves a progress number from 0 to 1 while the viewport stays
 * put. That one number drives the 3D sheet and every caption. The headline is
 * ordinary server-rendered text at progress 0, which is what a crawler and a
 * reader with JavaScript off both get.
 *
 * Every element here owns its MotionValues. A value shared between two
 * elements is destroyed when either unmounts — which Fast Refresh and Strict
 * Mode both do — and the survivor silently stops updating. That is why there
 * are two near-identical opacity transforms below rather than one.
 *
 * With reduced motion the pinning is dropped and the screens simply stack.
 */

const BEATS = [
  {
    step: "01 · It reads both",
    title: "Every requirement, checked against a line it can quote.",
    body: "The post is read for what it asks. Your CV is read for what it says. A requirement counts as met only when Aptly can point at the line that shows it — so a low score is an honest answer, not a failure.",
    side: "left",
    at: [0.16, 0.24, 0.36, 0.42],
  },
  {
    step: "02 · It changes only what is true",
    title: "One line rewritten in your words. One invented claim thrown out.",
    body: "The suggestion keeps your figures, your employers and your tools, and quotes the line it came from. Anything the advert asked for that you have never used is discarded before you see it — and you are shown the count.",
    side: "left",
    at: [0.46, 0.54, 0.66, 0.72],
  },
  {
    step: "03 · Then it keeps it",
    title: "Saved with the post as it was that day.",
    body: "The exact CV you sent, the job post frozen before it comes down, and a hash that proves which file it was. When they call five weeks later, it is one tap away.",
    side: "right",
    at: [0.76, 0.84, 0.97, 1],
  },
] as const;

export function Story() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const still = useMotionValue(0);
  const source = reduced ? still : scrollYProgress;

  // Motion 13 "accelerates" a scroll-linked opacity or transform by handing it
  // to the browser as a native ViewTimeline animation and never writing the
  // inline style again. Inside a sticky container that animation came apart in
  // Chrome — the headline stopped fading and sat on top of every beat. Passing
  // progress through a function transform drops the acceleration metadata, so
  // every value below is computed in the frame loop and written as a style.
  const progress = useTransform(source, (value) => value);

  const heroOpacity = useTransform(progress, [0, 0.09], [1, 0]);
  const heroY = useTransform(progress, [0, 0.09], [0, -28]);

  const scoreOpacity = useTransform(progress, [0.2, 0.26, 0.9, 0.96], [0, 1, 1, 0]);
  const scoreLeft = useTransform(progress, [0.7, 0.86], ["52%", "30%"]);
  const scoreTop = useTransform(progress, [0.7, 0.86], ["26%", "21%"]);
  const scoreRaw = useTransform(progress, [0.48, 0.62], [24, 61]);
  const scoreText = useTransform(scoreRaw, (v) => `${Math.round(v)}%`);

  const beat1Opacity = useTransform(progress, [...BEATS[0].at], [0, 1, 1, 0]);
  const beat1Y = useTransform(progress, [...BEATS[0].at], [18, 0, 0, -18]);
  const beat2Opacity = useTransform(progress, [...BEATS[1].at], [0, 1, 1, 0]);
  const beat2Y = useTransform(progress, [...BEATS[1].at], [18, 0, 0, -18]);
  const beat3Opacity = useTransform(progress, [...BEATS[2].at], [0, 1, 1, 0]);
  const beat3Y = useTransform(progress, [...BEATS[2].at], [18, 0, 0, -18]);
  const beatStyles = [
    { opacity: beat1Opacity, y: beat1Y },
    { opacity: beat2Opacity, y: beat2Y },
    { opacity: beat3Opacity, y: beat3Y },
  ];

  return (
    <section ref={ref} id="story" className={cn(styles.story, reduced && styles.storyStatic)}>
      <div className={styles.sticky}>
        <CvScene progress={progress} />

        <m.div className={styles.heroCopy} style={reduced ? undefined : { opacity: heroOpacity, y: heroY }}>
          <span className={cn(styles.eyebrowChip, styles.anim)} style={{ "--d": "0.05s" } as React.CSSProperties}>
            <span className={styles.eyebrowDot} aria-hidden />
            A CV tool with a memory
          </span>

          <h1 className={cn(styles.headline, styles.display)}>
            <span className={styles.headlineLine} style={{ "--d": "0.12s" } as React.CSSProperties}>
              Tailor every application.
            </span>
            <span
              className={cn(styles.headlineLine, styles.headlineAccent)}
              style={{ "--d": "0.26s" } as React.CSSProperties}
            >
              Be ready when they call.
            </span>
          </h1>

          <p className={cn(styles.lede, styles.anim)} style={{ "--d": "0.3s" } as React.CSSProperties}>
            Drop a job post and your CV. Aptly shows the exact lines to change and why,
            applies them in one tap, and keeps every application — so the moment a
            recruiter calls, you already have what you sent.
          </p>

          <div className={cn(styles.ctaRow, styles.anim)} style={{ "--d": "0.42s" } as React.CSSProperties}>
            <Link href="/tailor" className={styles.cta}>
              Get your free score →
            </Link>
            <a href="#trust" className={styles.ctaGhost}>
              How it stays honest ↓
            </a>
          </div>
          <p className={cn(styles.ctaNote, styles.anim)} style={{ "--d": "0.5s" } as React.CSSProperties}>
            No sign-up needed · See the match in a minute · Stored only against your own account
          </p>
        </m.div>

        {BEATS.map((beat, i) => (
          <m.div
            key={beat.step}
            className={cn(styles.caption, beat.side === "left" ? styles.captionLeft : styles.captionRight)}
            style={reduced ? undefined : beatStyles[i]}
          >
            <p className={styles.captionStep}>{beat.step}</p>
            <h2 className={cn(styles.captionTitle, styles.display)}>{beat.title}</h2>
            <p className={styles.captionBody}>{beat.body}</p>

            {i === 2 && (
              <div className={styles.record} aria-hidden>
                <div className={styles.recordRow}>
                  <span>
                    <strong>Meridian Analytics</strong> · Data Engineer
                  </span>
                  <span className={styles.recordStatus}>Applied</span>
                </div>
                <p className={styles.recordMeta}>
                  Rahul_Menon_DataEng.docx · sha256 9f3c…e21a · post frozen 13 Nov
                </p>
              </div>
            )}
          </m.div>
        ))}

        <m.div
          className={styles.score}
          style={reduced ? undefined : { opacity: scoreOpacity, left: scoreLeft, top: scoreTop }}
          aria-hidden
        >
          <m.span className={cn(styles.scoreValue, styles.display)}>{scoreText}</m.span>
          <span className={styles.scoreLabel}>requirements met</span>
        </m.div>
      </div>
    </section>
  );
}
