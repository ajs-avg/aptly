import Link from "next/link";

import {
  BreakdownFrame,
  CallFrame,
  CompareFrame,
  GateFrame,
  LibraryFrame,
  ScanFrame,
  ScoreFrame,
} from "./frames";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

/*
 * The page, section by section, in one shape: a headline on the left, one
 * sentence on the right, the product underneath. The words are the product's
 * own — nothing here was rewritten — but there are far fewer of them on the
 * page, because the picture now says most of it.
 */

/* ── Hero ─────────────────────────────────────────────────────────────────── */

export function Hero() {
  return (
    <section className={styles.hero}>
      <p className={cn(styles.eyebrow, styles.anim)}>A CV tool with a memory</p>
      <h1 className={cn(styles.headline, styles.display, styles.anim)} style={{ "--d": "0.06s" } as React.CSSProperties}>
        Tailor every application. <span className={styles.headlineAccent}>Be ready when they call.</span>
      </h1>
      <p className={cn(styles.lede, styles.anim)} style={{ "--d": "0.12s" } as React.CSSProperties}>
        Drop a job post and your CV. Aptly shows the exact lines to change and why,
        applies them in one tap, and keeps every application — so the moment a recruiter
        calls, you already have what you sent.
      </p>
      <div className={cn(styles.ctaRow, styles.anim)} style={{ "--d": "0.18s" } as React.CSSProperties}>
        <Link href="/tailor" className={styles.cta}>
          Get your free score
        </Link>
        <a href="#how" className={styles.ctaGhost}>
          See how it works
        </a>
      </div>
      <p className={cn(styles.ctaNote, styles.anim)} style={{ "--d": "0.22s" } as React.CSSProperties}>
        No sign-up needed · See the match in a minute · Stored only against your own account
      </p>

      <div className={cn(styles.heroFrame, styles.anim)} style={{ "--d": "0.3s" } as React.CSSProperties}>
        <CompareFrame />
      </div>
    </section>
  );
}

const NUMBERS = [
  ["60s", "From drop to score"],
  ["7", "Checks on every suggestion"],
  ["5", "File formats, kept as they came"],
  ["100%", "Suggestions verified before you see them"],
];

export function Numbers() {
  return (
    <div className={styles.numbers} aria-label="Aptly in numbers">
      {NUMBERS.map(([v, l]) => (
        <div key={l} className={styles.number}>
          <p className={cn(styles.numberValue, styles.display)} data-numeric>
            {v}
          </p>
          <p className={styles.numberLabel}>{l}</p>
        </div>
      ))}
    </div>
  );
}

/* ── How it works ─────────────────────────────────────────────────────────── */

export function How() {
  return (
    <section id="how" className={styles.section}>
      <div className={styles.split}>
        <h2 className={cn(styles.h2, styles.display)}>
          Two boxes, then a short list of changes
        </h2>
        <div>
          <p className={styles.splitBody}>
            No long forms and no setup before the first result. Paste the post, drop the
            CV, and read what Aptly would change.
          </p>
          <Link href="/tailor" className={styles.splitLink}>
            Try it on a job you are applying to →
          </Link>
        </div>
      </div>

      <div className={styles.cells}>
        <div className={styles.cell}>
          <ScanFrame className={styles.cellArt} />
          <div>
            <h3 className={styles.cellTitle}>It reads both</h3>
            <p className={styles.cellBody}>
              The post for what it asks, your CV for what it says. The score is knowable
              about fifteen seconds in — well before any suggestion exists.
            </p>
          </div>
        </div>
        <div className={styles.cell}>
          <ScoreFrame className={styles.cellArt} />
          <div>
            <h3 className={styles.cellTitle}>An honest number</h3>
            <p className={styles.cellBody}>
              One segment per requirement, wide for a must-have. A low score is the
              honest answer, not a failure.
            </p>
          </div>
        </div>
        <div className={styles.cell}>
          <BreakdownFrame className={styles.cellArt} />
          <div>
            <h3 className={styles.cellTitle}>The working, on the page</h3>
            <p className={styles.cellBody}>
              Every requirement and what was decided about it, so you can check the
              number line by line rather than take it on trust.
            </p>
          </div>
        </div>
        <div className={styles.cell}>
          <div className={cn(styles.cellArt, "grid content-start gap-2")}>
            {[
              ["Now", "Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding flow.", "amber"],
              ["Suggested", "Reduced customer site deployment time from 12 weeks to 6 by rebuilding the onboarding flow.", "signal"],
            ].map(([k, v, tone]) => (
              <div
                key={k}
                className={cn(
                  "rounded-lg border-l-2 bg-raised px-3 py-2.5 ring-1 ring-hairline",
                  tone === "amber" ? "border-amber" : "border-signal",
                )}
              >
                <p className="font-display text-[0.62rem] uppercase tracking-[0.12em] text-slate">{k}</p>
                <p className="cv-literal pt-1 text-xs leading-snug text-ink/90">{v}</p>
              </div>
            ))}
            <p className="pt-1 text-2xs text-slate">The post asks for evidence of shortening deployment time.</p>
          </div>
          <div>
            <h3 className={styles.cellTitle}>It quotes you before it changes you</h3>
            <p className={styles.cellBody}>
              The current wording, the proposed wording, and one plain reason tied to the
              post. Apply it, or do not. Undo is one tap.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Trust ────────────────────────────────────────────────────────────────── */

const RULES = [
  { glyph: "+", title: "Nothing added", body: "A figure, company or tool not already in your CV means the suggestion is discarded. The advert asking for Kubernetes is not evidence that you have used it." },
  { glyph: "−", title: "Nothing removed", body: "Tailoring is emphasis, not subtraction. A skills line can be reordered to lead with what this job wants; it cannot come back shorter than it went in." },
  { glyph: "◎", title: "Nothing hidden", body: "You see how many suggestions were thrown away and why. Anything borrowed from the employer's wording is flagged for you to confirm." },
];

export function Trust() {
  return (
    <section id="trust" className={styles.section}>
      <div className={styles.split}>
        <h2 className={cn(styles.h2, styles.display)}>It will not invent things about you</h2>
        <p className={styles.splitBody}>
          Not because a prompt asks it nicely. Because a check runs on every single
          suggestion before you ever see it.
        </p>
      </div>

      <div className={styles.stage}>
        <GateFrame />
      </div>

      <div className={cn(styles.cells, styles.cells3)}>
        {RULES.map((rule) => (
          <div key={rule.title} className={styles.cell}>
            <span className={cn(styles.cellGlyph, styles.display)} aria-hidden>
              {rule.glyph}
            </span>
            <div>
              <h3 className={styles.cellTitle}>{rule.title}</h3>
              <p className={styles.cellBody}>{rule.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── The Library ──────────────────────────────────────────────────────────── */

export function Keep() {
  return (
    <section id="library" className={styles.section}>
      <div className={styles.split}>
        <h2 className={cn(styles.h2, styles.display)}>Then it keeps the whole thing</h2>
        <p className={styles.splitBody}>
          The job post is frozen the day you apply, stored with the exact CV you sent and
          a hash that proves which file it was. Search by company, by role, or by a phrase
          you half-remember from the advert.
        </p>
      </div>

      <div className={styles.stage}>
        <LibraryFrame />
      </div>
    </section>
  );
}

/* ── The call ─────────────────────────────────────────────────────────────── */

export function Moment() {
  return (
    <section id="call" className={styles.section}>
      <div className={styles.split}>
        <h2 className={cn(styles.h2, styles.display)}>
          A recruiter calls. You applied five weeks ago.
        </h2>
        <p className={styles.splitBody}>
          You cannot remember which CV you sent, and the job post is gone from the site.
          Every other tool stops at &ldquo;hit send&rdquo;. Aptly follows you into the
          part that decides the outcome — so you open one screen instead of stalling.
        </p>
      </div>

      <div className={styles.stage}>
        <CallFrame />
      </div>
    </section>
  );
}

/* ── Pricing ──────────────────────────────────────────────────────────────── */

const PLANS = [
  { key: "free", label: "Free", price: "$0", unit: "", note: "Enough to feel whether this helps you.", features: ["A few tailorings a month", "Every format: .docx, .pdf, .tex, .txt", "The full no-fabrication check", "Records you save by hand"], featured: false },
  { key: "pro", label: "Pro", price: "$16", unit: "/ month", note: "For a real search, where every call matters.", features: ["Unlimited tailoring", "Recruiter-Ready Card", "Story Bank and Gap Coach", "Predicted interview questions", "Follow-up reminders and contact log", "Version history with rollback"], featured: true },
  { key: "week", label: "Week pass", price: "$5", unit: "/ 7 days", note: "For one application that matters this week.", features: ["Everything in Pro", "Seven days, no subscription", "Your records stay after it ends"], featured: false },
];

export function Pricing() {
  return (
    <section id="pricing" className={styles.section}>
      <div className={styles.split}>
        <h2 className={cn(styles.h2, styles.display)}>
          One honest profile. Every application.
        </h2>
        <p className={styles.splitBody}>
          Less than the keyword scanners, and it covers the part of the journey they
          leave out.
        </p>
      </div>

      <div className={styles.plans}>
        {PLANS.map((plan) => (
          <div key={plan.key} className={cn(styles.plan, plan.featured && styles.planFeatured)}>
            <p className={styles.planName}>{plan.label}</p>
            <div className={styles.planPrice}>
              <span className={cn(styles.planFigure, styles.display)}>{plan.price}</span>
              {plan.unit && <span className={styles.planUnit}>{plan.unit}</span>}
            </div>
            <p className={styles.planNote}>{plan.note}</p>
            <ul className={styles.planList}>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link href="/tailor" className={cn(styles.planCta, plan.featured && styles.planCtaFeatured)}>
              Start tailoring
            </Link>
          </div>
        ))}
      </div>
      <p className={styles.planFoot}>
        Paid plans are not live yet — tailoring is free while they are being built. No
        card, no waitlist.
      </p>
    </section>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */

const QUESTIONS = [
  ["Will it invent things about my experience?", "No, and not because it was asked politely. Every suggestion must quote the line it came from, and a check runs afterwards on all of them: any figure, company or technology not already in your CV means the suggestion is discarded before it reaches you."],
  ["What happens to my CV? Is it stored?", "Nothing is saved until you ask. You can tailor a CV with no account at all, and the file stays in your browser. When you do save an application it is yours alone, and there is a plain control to export or delete everything."],
  ["Which file formats can I use?", ".docx, .pdf, .tex, .txt and .md. For .docx and .tex the edits go into your own file, so your formatting survives exactly. A .pdf cannot be edited in place, so Aptly measures your fonts and layout and rebuilds a close copy — and tells you when it has."],
  ["Why does it sometimes suggest nothing?", "Because for that section there was nothing worth changing, and saying so is more useful than inventing edits."],
  ["Does a higher keyword score mean I will get the interview?", "No, and tools implying otherwise are selling you something. Aptly reports coverage honestly, including a low number, and never repeats a term to inflate it."],
  ["What is the Recruiter-Ready Card?", "One screen for the phone call: the CV you sent, the job post as it was on the day, why you fit, your talking points, the questions to expect, and the gaps to own honestly."],
  ["Can it delete parts of my CV to make it fit?", "It cannot. Tailoring here is emphasis, not subtraction. A skills line can be reordered to lead with what the job asks for, but it may not come back shorter than it went in."],
  ["Do I need an account?", "Not to tailor. Only to keep things. If you save something first and sign in afterwards, the work comes with you rather than being lost."],
];

export function Faq() {
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.split}>
        <h2 className={cn(styles.h2, styles.display)}>Frequently asked questions</h2>
        <p className={styles.splitBody}>Including the parts Aptly cannot do.</p>
      </div>
      <div className={styles.faq}>
        {QUESTIONS.map(([q, a], i) => (
          <details key={q} className={styles.faqItem} open={i === 0}>
            <summary>{q}</summary>
            <p className={styles.faqBody}>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ── Closing and footer ───────────────────────────────────────────────────── */

export function Closing() {
  return (
    <section className={cn(styles.section, styles.closing)}>
      <h2 className={cn(styles.h2, styles.display)}>Start with the job you are applying to today.</h2>
      <div className={styles.ctaRow}>
        <Link href="/tailor" className={styles.cta}>
          Get your free score
        </Link>
        <Link href="/sign-in?mode=signup" className={styles.ctaGhost}>
          Create an account
        </Link>
      </div>
      <p className={styles.ctaNote}>Takes about a minute. No sign-up to see it.</p>
    </section>
  );
}

const FOOTER = [
  { heading: "Product", links: [["Tailor a CV", "/tailor"], ["Library", "/library"], ["How it works", "#how"], ["Pricing", "#pricing"]] },
  { heading: "Trust", links: [["No fabrication", "#trust"], ["Your data", "#trust"], ["FAQ", "#faq"]] },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        <div>
          <p className={cn(styles.footerBrand, styles.display)}>Aptly</p>
          <p className={styles.footerBlurb}>Tailor every application. Be ready when they call.</p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.heading}>
            <p className={styles.footerHead}>{col.heading}</p>
            <ul className={styles.footerList}>
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className={styles.footerHead}>Coming next</p>
          <ul className={styles.footerList}>
            {["Story Bank", "Recruiter-Ready Card", "Gap Coach", "Browser clipper"].map((i) => (
              <li key={i}>
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.footerBottom}>
        <p>Nothing is stored until you ask. Export or delete everything, any time.</p>
        <p>Built around one moment: the callback.</p>
      </div>
    </footer>
  );
}
