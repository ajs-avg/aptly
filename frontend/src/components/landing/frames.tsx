"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ShapeThumbnail } from "@/components/visual/CvThumbnail";
import { ScoreRing } from "@/components/visual/ScoreRing";
import { ValidatorGate } from "@/components/visual/ValidatorGate";
import { cn } from "@/lib/utils";
import type { RuleResult, ShapeLine } from "@/lib/types";

/**
 * The product, drawn on the landing page.
 *
 * Linear's pages carry no stock photography and no illustration. Every
 * picture is their own interface, recreated in a dark frame and set in
 * motion. That is the right answer here too: Aptly's visual *is* a CV being
 * read, changed and filed, and a drawing of anything else would be a picture
 * of some other product.
 *
 * So these are the real screens, in miniature, running. The score ring and
 * the thumbnails are the components the app ships; the rest is the same
 * markup at a smaller scale. Nothing is a screenshot — a screenshot goes
 * stale the afternoon the interface changes, and it is an image, so a screen
 * reader gets nothing from it.
 *
 * Every frame plays once when it scrolls into view, and holds its final
 * state for anyone who asked motion to stop.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── The dark frame every picture sits in ─────────────────────────────────── */

export function Frame({
  title,
  className,
  children,
  bare = false,
}: {
  /** The window's own title bar text. */
  title?: string;
  className?: string;
  children: React.ReactNode;
  /** No title bar: the visual is the whole frame. */
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-raised ring-1 ring-hairline",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_30px_80px_-20px_rgba(0,0,0,0.7)]",
        className,
      )}
    >
      {!bare && (
        <div className="flex h-9 items-center gap-3 border-b border-hairline px-3.5">
          <span className="flex gap-1.5" aria-hidden>
            <i className="block size-2 rounded-full bg-white/10" />
            <i className="block size-2 rounded-full bg-white/10" />
            <i className="block size-2 rounded-full bg-white/10" />
          </span>
          {title && (
            <span className="truncate font-display text-2xs text-slate">{title}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function usePlay(amount = 0.35) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount });
  const still = useReducedMotion();
  return { ref, play: Boolean(seen || still), still: Boolean(still) };
}

/* ── A CV, as a stack of lines ────────────────────────────────────────────── */

const CV_LINES: Array<{ w: number; k: "n" | "c" | "h" | "r" | "b" }> = [
  { w: 46, k: "n" },
  { w: 60, k: "c" },
  { w: 30, k: "h" },
  { w: 92, k: "b" },
  { w: 84, k: "b" },
  { w: 34, k: "h" },
  { w: 70, k: "r" },
  { w: 95, k: "b" },
  { w: 88, k: "b" },
  { w: 76, k: "b" },
  { w: 66, k: "r" },
  { w: 90, k: "b" },
  { w: 58, k: "b" },
];

const JOB_SHAPE: ShapeLine[] = [
  { w: 52, k: "n" },
  { w: 40, k: "c" },
  { w: 28, k: "h" },
  { w: 88, k: "b" },
  { w: 80, k: "b" },
  { w: 72, k: "b" },
  { w: 30, k: "h" },
  { w: 84, k: "b" },
  { w: 66, k: "b" },
];

/* ── A CV with words on it ────────────────────────────────────────────────── */

interface DocLine {
  text: React.ReactNode;
  /** A teal mark in the margin: the post is satisfied by this line. */
  mark?: boolean;
  /** Set in the editor's literal face: this is a line being rewritten. */
  tone?: "amber" | "signal";
  /** Rendered directly under the line — where a change card lands. */
  after?: React.ReactNode;
}

interface DocSection {
  title: string;
  heading?: string;
  lines: DocLine[];
}

/**
 * Linear's frames carry real text — a real Slack thread, a real diff — and
 * that is what makes them read as the product rather than a wireframe of it.
 * So this is a real CV, the demo pair's, at the size a card allows: the name,
 * the sections, the actual bullets. Small, but every word is a word.
 */
function Doc({
  name,
  meta,
  sections,
  className,
}: {
  name: string;
  meta: string;
  sections: DocSection[];
  className?: string;
}) {
  return (
    <div className={cn("text-left", className)}>
      <p className="font-display text-[13px] font-semibold tracking-[-0.01em] text-ink">{name}</p>
      <p className="pt-0.5 text-[10px] text-slate">{meta}</p>
      {sections.map((section) => (
        <div key={section.title} className="pt-3">
          <p className="border-b border-hairline pb-1 font-display text-[9px] font-medium uppercase tracking-[0.12em] text-slate">
            {section.title}
          </p>
          {section.heading && (
            <p className="pt-1.5 text-[10.5px] font-medium text-ink/90">{section.heading}</p>
          )}
          <ul className="grid gap-1 pt-1.5">
            {section.lines.map((line, i) => (
              <li key={i} className="grid grid-cols-[10px_1fr] gap-1.5">
                <span className="flex h-[15px] items-center justify-center">
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-colors duration-500",
                      line.mark ? "bg-signal" : "bg-white/[0.14]",
                    )}
                  />
                </span>
                <div className="relative min-w-0">
                  <p
                    className={cn(
                      "text-[10.5px] leading-[15px] text-ink/85 transition-colors duration-500",
                      line.tone === "amber" && "cv-literal rounded-sm bg-amber/15 px-1 text-amber-ink",
                      line.tone === "signal" && "cv-literal rounded-sm bg-signal/15 px-1 text-ink",
                    )}
                  >
                    {line.text}
                  </p>
                  {line.after}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ── 1. The hero: two finished CVs, a change landing, the score moving ───── */

export function CompareFrame({ className }: { className?: string }) {
  const { ref, play, still } = usePlay(0.05);
  const [step, setStep] = useState(still ? 3 : 0);

  // On a loop: the card arrives, is applied, the line turns teal and the
  // score climbs; then it rests and runs again. Still for anyone who asked
  // motion to stop — they get the finished state.
  useEffect(() => {
    if (!play || still) return;
    let cancelled = false;
    const timers: number[] = [];
    const run = () => {
      if (cancelled) return;
      setStep(0);
      timers.push(window.setTimeout(() => setStep(1), 1100));
      // The card stays long enough to be read: two lines and a reason.
      timers.push(window.setTimeout(() => setStep(2), 3400));
      timers.push(window.setTimeout(() => setStep(3), 4200));
      timers.push(window.setTimeout(run, 9400));
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [play, still]);

  const score = step >= 3 ? 61 : 34;

  /* The bullet the suggestion rewrites, before and after. */
  const before =
    "Built the internal pricing dashboard end to end, writing the SQL queries that pull from PostgreSQL and the React interface that displays them.";
  const after =
    "Wrote the SQL queries behind the internal pricing dashboard, pulling from PostgreSQL, and the React interface that displays them.";

  const card = (
    <motion.div
      initial={false}
      animate={{ opacity: step === 1 ? 1 : 0, y: step === 1 ? 0 : 6 }}
      transition={{ duration: 0.4, ease: EASE }}
      /* Opens upward: the line it is about is the last thing before the
         frame's footer, and a card below it would run into that. */
      className="pointer-events-none absolute inset-x-0 bottom-full z-10"
    >
      <div className="mb-1.5 rounded-md bg-raised p-2.5 shadow-float ring-1 ring-hairline">
        <p className="cv-literal text-[10.5px] leading-snug text-ink/90">
          Wrote the <span className="rounded-sm bg-amber/25 px-0.5 text-amber-ink">SQL</span> queries
          behind the internal pricing dashboard, pulling from PostgreSQL, and the React interface
          that displays them.
        </p>
        <p className="pt-1 text-[10px] text-slate">The post selects on SQL; this brings it forward.</p>
        <div className="flex items-center gap-2 pt-1.5">
          <span className="rounded-pill bg-signal px-2 py-0.5 font-display text-[10px] font-medium text-paper">
            Apply
          </span>
          <span className="font-display text-[10px] text-slate">Skip</span>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div ref={ref} className={className}>
      <Frame title="Data Engineer · Meridian Analytics">
        <div className="grid gap-px bg-hairline md:grid-cols-2">
          <Panel label="Your CV, tailored" dot="signal" score={score} baseline={34} instant={step < 3}>
            <Doc
              name="Rahul Menon"
              meta="Frontend Developer · rahul.menon@example.com · Bengaluru"
              sections={[
                {
                  title: "Professional summary",
                  lines: [
                    {
                      text: "Frontend developer with three years building customer-facing web applications. Comfortable owning a feature from design handoff through to production.",
                    },
                  ],
                },
                {
                  title: "Technical skills",
                  lines: [
                    { text: "Languages: JavaScript, TypeScript, Python, HTML5, CSS3", mark: step >= 2 },
                    { text: "Backend & Data: Node.js, Express.js, REST APIs, PostgreSQL, SQL", mark: step >= 2 },
                  ],
                },
                {
                  title: "Work experience",
                  heading: "Frontend Developer · Kalyra Commerce · 2023 – Present",
                  lines: [
                    { text: "Rebuilt the product listing page in Next.js, cutting time to first paint from 4.1 seconds to 1.3." },
                    {
                      text: step >= 2 ? after : before,
                      tone: step === 1 ? "amber" : step >= 2 ? "signal" : undefined,
                      mark: step >= 2,
                      after: card,
                    },
                    { text: "Wrote a Python script that reconciles the nightly product feed against the catalogue.", mark: step >= 2 },
                  ],
                },
              ]}
            />
          </Panel>

          <Panel label="Written from scratch" dot="amber" score={34} baseline={34} instant>
            <Doc
              name="Rahul Menon"
              meta="rahul.menon@example.com · Bengaluru"
              sections={[
                {
                  title: "Summary",
                  lines: [
                    {
                      text: "Frontend developer with three years of experience, including SQL queries for internal dashboards and Python scripts for data reconciliation.",
                      mark: true,
                    },
                  ],
                },
                {
                  title: "Experience",
                  heading: "Frontend Developer · Kalyra Commerce",
                  lines: [
                    { text: "Wrote the SQL queries behind the internal pricing dashboard, pulling from PostgreSQL for 22 daily users.", mark: true },
                    { text: "Wrote a Python script reconciling the nightly product feed against the catalogue, replacing a two-hour manual check.", mark: true },
                    { text: "Rebuilt the product listing page in Next.js, cutting first paint from 4.1s to 1.3s." },
                  ],
                },
                {
                  title: "Skills",
                  lines: [{ text: "Python, SQL, PostgreSQL, JavaScript, TypeScript, React, Next.js", mark: true }],
                },
              ]}
            />
          </Panel>
        </div>

        {/* The cover letter and the share row, as the real screen has them. */}
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
          <span className="text-2xs text-slate">
            The cover letter, written from what your CV already proves.
          </span>
          <span className="rounded-pill bg-ink px-2.5 py-1 font-display text-2xs font-medium text-paper">
            Write it for this job
          </span>
        </div>
      </Frame>
    </div>
  );
}

function Panel({
  label,
  dot,
  score,
  baseline,
  instant,
  children,
}: {
  label: string;
  dot: "signal" | "amber";
  score: number;
  baseline: number;
  instant?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-display text-xs font-medium text-ink">
            <span className={cn("size-1.5 rounded-full", dot === "signal" ? "bg-signal" : "bg-amber")} />
            {label}
          </p>
        </div>
        <ScoreRing value={score} baseline={baseline} size={52} instant={instant} />
      </div>
      <div className="pt-3">{children}</div>
    </div>
  );
}

/* ── 2. Reading: the beam runs, the steps tick ────────────────────────────── */

const STEPS = ["Reading the job post", "Reading your CV against it", "Scoring every requirement", "Writing both versions"];

export function ScanFrame({ className }: { className?: string }) {
  const { ref, play, still } = usePlay();
  const [reached, setReached] = useState(still ? 4 : 0);

  useEffect(() => {
    if (!play || still) return;
    const timers = [1, 2, 3, 4].map((n) => window.setTimeout(() => setReached(n), 500 + n * 850));
    return () => timers.forEach(clearTimeout);
  }, [play, still]);

  return (
    <div ref={ref} className={className}>
      <Frame bare className="p-4">
        <div className="grid grid-cols-[1fr_auto] gap-5">
          <ul className="grid content-start gap-2">
            {STEPS.map((label, i) => {
              const done = i < reached;
              const active = i === reached;
              return (
                <li key={label} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full ring-1 transition-colors duration-300",
                      done ? "bg-signal ring-signal" : active ? "ring-signal" : "ring-hairline",
                    )}
                  >
                    {done && (
                      <svg viewBox="0 0 24 24" className="size-2.5 text-paper" fill="none" stroke="currentColor" strokeWidth="4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                    {active && !still && (
                      <motion.span
                        className="size-1 rounded-full bg-signal"
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    )}
                  </span>
                  <span className={cn("text-xs transition-colors", done || active ? "text-ink" : "text-slate/60")}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* The sheet, with the beam passing down it. */}
          <div className="relative h-36 w-28 shrink-0 overflow-hidden rounded-md bg-sunken ring-1 ring-hairline">
            {/* The real document, reduced the way a file preview is — the
                words are there, at the size a thumbnail allows. */}
            <div className="w-[280px] origin-top-left scale-[0.4] p-4">
              <Doc
                name="Rahul Menon"
                meta="Frontend Developer · Bengaluru"
                sections={[
                  {
                    title: "Technical skills",
                    lines: [
                      { text: "JavaScript, TypeScript, Python, HTML5, CSS3", mark: reached >= 3 },
                      { text: "Node.js, Express.js, REST APIs, PostgreSQL, SQL", mark: reached >= 3 },
                    ],
                  },
                  {
                    title: "Work experience",
                    heading: "Frontend Developer · Kalyra Commerce",
                    lines: [
                      { text: "Rebuilt the product listing page in Next.js, cutting time to first paint from 4.1s to 1.3s." },
                      { text: "Built the internal pricing dashboard end to end, writing the SQL that pulls from PostgreSQL.", mark: reached >= 3 },
                      { text: "Wrote a Python script that reconciles the nightly product feed against the catalogue.", mark: reached >= 3 },
                    ],
                  },
                ]}
              />
            </div>
            {play && !still && reached < 4 && (
              <motion.span
                aria-hidden
                className="absolute inset-x-0 h-4 bg-gradient-to-b from-transparent via-signal/40 to-transparent"
                initial={{ top: "-10%" }}
                animate={{ top: "110%" }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>
        </div>
      </Frame>
    </div>
  );
}

/* ── 3. The score, with its working around it ─────────────────────────────── */

const RULES: RuleResult[] = [
  { id: "1", requirement: "3+ years in a data engineering role", essential: true, status: "missing", present: [], absent: [] },
  { id: "2", requirement: "Strong SQL, including window functions", essential: true, status: "covered", present: ["SQL"], absent: [] },
  { id: "3", requirement: "Production Python — Pandas or PySpark", essential: true, status: "partial", present: ["Python"], absent: ["Pandas"] },
  { id: "4", requirement: "Hands-on Airflow", essential: true, status: "missing", present: [], absent: ["Airflow"] },
  { id: "5", requirement: "Dimensional modelling", essential: true, status: "missing", present: [], absent: [] },
  { id: "6", requirement: "Cloud warehouse — Snowflake or BigQuery", essential: true, status: "missing", present: [], absent: ["Snowflake"] },
  { id: "7", requirement: "Comfort on AWS", essential: true, status: "partial", present: [], absent: ["AWS"] },
  { id: "8", requirement: "dbt in production", essential: false, status: "missing", present: [], absent: ["dbt"] },
  { id: "9", requirement: "Kafka or another streaming platform", essential: false, status: "missing", present: [], absent: ["Kafka"] },
  { id: "10", requirement: "Retail or e-commerce data", essential: false, status: "covered", present: [], absent: [] },
];

export function ScoreFrame({ className }: { className?: string }) {
  const { ref, play } = usePlay();
  return (
    <div ref={ref} className={className}>
      <Frame bare className="grid place-items-center p-5">
        <ScoreRing value={play ? 34 : 0} rules={RULES} size={150} />
        <p className="pt-2 font-display text-[0.62rem] uppercase tracking-[0.12em] text-slate">
          requirements met
        </p>
        <p className="pt-2 font-display text-sm font-medium text-amber-ink">This is a stretch.</p>
        <p className="pt-1 text-center text-2xs text-slate" data-numeric>
          Must-haves met: 2 of 7
        </p>
      </Frame>
    </div>
  );
}

/* ── 4. Every requirement, and what was decided ───────────────────────────── */

const PILL: Record<RuleResult["status"], string> = {
  covered: "bg-signal-soft text-signal",
  partial: "bg-amber-soft text-amber-ink",
  missing: "bg-white/[0.06] text-slate",
};
const WORD: Record<RuleResult["status"], string> = {
  covered: "Met",
  partial: "Partly",
  missing: "Not shown",
};

export function BreakdownFrame({ className }: { className?: string }) {
  const { ref, play, still } = usePlay();
  return (
    <div ref={ref} className={className}>
      <Frame bare className="p-4">
        <p className="pb-2.5 font-display text-[0.62rem] uppercase tracking-[0.12em] text-slate">
          What the post requires
        </p>
        <ul className="grid gap-1.5">
          {RULES.slice(0, 6).map((rule, i) => (
            <motion.li
              key={rule.id}
              initial={still ? false : { opacity: 0, x: -6 }}
              animate={play ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.4, ease: EASE, delay: i * 0.07 }}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="truncate text-ink/85">{rule.requirement}</span>
              <span className={cn("shrink-0 rounded-pill px-2 py-0.5 font-display text-[0.62rem] font-medium", PILL[rule.status])}>
                {WORD[rule.status]}
              </span>
            </motion.li>
          ))}
        </ul>
        <p className="pt-3 text-[0.65rem] leading-relaxed text-slate">
          A requirement counts as met only when Aptly can point at the line that shows it.
        </p>
      </Frame>
    </div>
  );
}

/* ── 5. The check that stops an invented claim ────────────────────────────── */

export function GateFrame({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Frame title="Every suggestion, before you see it" className="p-4 sm:p-6">
        <ValidatorGate />
      </Frame>
    </div>
  );
}

/* ── 6. The Library, with the CV on every card ────────────────────────────── */

const RECORDS = [
  { company: "Meridian Analytics", role: "Data Engineer", score: 61, status: "Interviewing", live: true, sent: "Tailored", shape: JOB_SHAPE, count: 2 },
  { company: "Acme Robotics", role: "Senior Product Manager", score: 72, status: "Screening", live: true, sent: "Rebuilt", shape: CV_LINES.slice(0, 9) as ShapeLine[], count: 1 },
  { company: "Northwind", role: "Product Manager", score: 48, status: "Applied", live: false, sent: "Tailored", shape: JOB_SHAPE.slice(0, 7), count: 1 },
];

export function LibraryFrame({ className }: { className?: string }) {
  const { ref, play, still } = usePlay();
  return (
    <div ref={ref} className={className}>
      <Frame title="Library · 12 applications">
        <div className="grid gap-px bg-hairline sm:grid-cols-[1fr_1.1fr]">
          <div className="bg-raised p-3">
            <div className="flex items-end gap-5 pb-3">
              {[
                ["12", "applications"],
                ["3", "live now"],
                ["33%", "heard back"],
              ].map(([v, l], i) => (
                <div key={l}>
                  <p className={cn("font-display text-lg font-medium leading-none", i === 1 ? "text-signal" : "text-ink")} data-numeric>
                    {v}
                  </p>
                  <p className="pt-0.5 text-[0.62rem] text-slate">{l}</p>
                </div>
              ))}
            </div>
            <div className="relative h-5">
              <div className="absolute inset-x-0 top-2.5 h-px bg-hairline" />
              {[4, 18, 27, 41, 52, 60, 74, 83, 97].map((x, i) => (
                <motion.span
                  key={x}
                  className={cn(
                    "absolute top-2.5 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-raised",
                    i % 3 === 1 ? "bg-signal" : i % 4 === 2 ? "bg-amber" : "bg-slate/50",
                  )}
                  style={{ left: `${x}%` }}
                  initial={still ? false : { scale: 0 }}
                  animate={play ? { scale: 1 } : undefined}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-px bg-hairline">
            {RECORDS.map((r, i) => (
              <motion.div
                key={r.company}
                initial={still ? false : { opacity: 0, y: 6 }}
                animate={play ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease: EASE }}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-raised px-3 py-2.5"
              >
                <div className="relative w-9">
                  <ShapeThumbnail shape={r.shape} className="w-full rounded-[4px]" />
                  {r.count > 1 && (
                    <span className="absolute -right-1 -top-1 rounded bg-sunken px-1 font-display text-[0.55rem] text-slate ring-1 ring-hairline">
                      {r.count}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-xs font-medium text-ink">{r.company}</p>
                  <p className="truncate text-[0.65rem] text-slate">{r.role}</p>
                  <div className="flex gap-1 pt-1">
                    <span className={cn("rounded-pill px-1.5 py-px font-display text-[0.58rem]", r.live ? "bg-signal-soft text-signal" : "bg-white/[0.06] text-slate")}>
                      {r.status}
                    </span>
                    <span className="rounded-pill bg-signal-soft px-1.5 py-px font-display text-[0.58rem] text-signal">
                      ✓ Sent: {r.sent}
                    </span>
                  </div>
                </div>
                <span className="rounded-pill bg-sunken px-1.5 py-0.5 font-display text-[0.62rem] font-medium text-ink" data-numeric>
                  {r.score}%
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </Frame>
    </div>
  );
}

/* ── 7. The call ──────────────────────────────────────────────────────────── */

export function CallFrame({ className }: { className?: string }) {
  const { ref, play, still } = usePlay();
  return (
    <div ref={ref} className={className}>
      <Frame title="Call mode · Acme Robotics">
        <div className="grid gap-px bg-hairline md:grid-cols-[1.1fr_1fr]">
          <div className="bg-raised p-4">
            <p className="font-display text-[0.62rem] uppercase tracking-[0.12em] text-slate">
              The CV you sent
            </p>
            <div className="mt-2.5 rounded-md bg-sunken p-3 ring-1 ring-hairline">
              <Doc
                name="Aman Sharma"
                meta="Senior Product Manager · aman@example.com · Pune"
                sections={[
                  {
                    title: "Experience",
                    heading: "Product Manager · Veltrix Devices · 2021 – Present",
                    lines: [
                      { text: "Led a hardware-plus-software launch across a team of 6, cutting customer ramp time by half.", mark: true },
                      { text: "Owned the onboarding flow end to end, from research through release." },
                      { text: "Ran weekly reviews with engineering, design and support.", mark: true },
                    ],
                  },
                ]}
              />
            </div>
            <p className="pt-2 text-[0.62rem] text-slate" data-numeric>
              Aman_SPM_Acme_v3.pdf · sha256 9f3c…e21a · post frozen 14 Oct
            </p>
          </div>

          <div className="relative bg-raised p-4">
            {/* The phone, ringing. */}
            <div className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-signal-soft">
              <svg viewBox="0 0 24 24" className="size-4 text-signal" fill="currentColor" aria-hidden>
                <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8Z" />
              </svg>
              {play && !still &&
                [0, 1].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute inset-0 rounded-full ring-1 ring-signal"
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity, delay: i, ease: "easeOut" }}
                  />
                ))}
            </div>

            {[
              ["Why you fit", "Led a hardware-plus-software launch; cut ramp time by half.", "text-ink/90"],
              ["Gaps to own", "Team size was 6, not 10+. Frame scope honestly.", "text-amber-ink"],
              ["They will probably ask", "How you measured the ramp-time change.", "text-ink/90"],
              ["Worth asking back", "Who the role reports to, and the size of the team now.", "text-ink/90"],
            ].map(([k, v, tone], i) => (
              <motion.div
                key={k}
                initial={still ? false : { opacity: 0, y: 6 }}
                animate={play ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.1, ease: EASE }}
                className={cn("max-w-[85%]", i > 0 && "pt-3")}
              >
                <p className="font-display text-[0.62rem] uppercase tracking-[0.12em] text-slate">{k}</p>
                <p className={cn("pt-0.5 text-xs leading-snug", tone)}>{v}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Frame>
    </div>
  );
}
