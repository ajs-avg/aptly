import Link from "next/link";

import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

/*
 * Everything under the pinned story. Ordinary server-rendered markup: it
 * ranks, it reads with JavaScript off, and the only interactive element — the
 * FAQ — is a native <details>, which needs none.
 */

const CAPABILITIES = [
  "One-tap apply",
  "No fabrication",
  "Frozen job posts",
  "Keeps your formatting",
  ".docx · .pdf · .tex",
  "Keyword coverage",
  "Version history",
  "Works without an account",
];

export function Capabilities() {
  return (
    <section className={styles.section} style={{ paddingTop: 0 }}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Everything the application needs, one screen away</p>
        </div>
        <div className={styles.pills} style={{ marginTop: 24 }}>
          {CAPABILITIES.map((item) => (
            <span key={item} className={styles.pill}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const TRUST = [
  {
    glyph: "+",
    title: "Nothing added",
    body: "A figure, company or tool that is not already in your CV means the suggestion is discarded. The advert asking for Kubernetes is not evidence that you have used it.",
  },
  {
    glyph: "−",
    title: "Nothing removed",
    body: "Tailoring is emphasis, not subtraction. A skills line can be reordered to lead with what this job wants; it cannot come back shorter than it went in.",
  },
  {
    glyph: "◎",
    title: "Nothing hidden",
    body: "You see how many suggestions were thrown away and why. Anything the model borrowed from the employer's wording is flagged for you to confirm.",
  },
];

export function Trust() {
  return (
    <section id="trust" className={cn(styles.section, styles.sectionMist)}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Trust as a feature</p>
          <h2 className={cn(styles.h2, styles.display)}>It will not invent things about you</h2>
          <p className={styles.sectionLede}>
            Not because a prompt asks it nicely. Because a check runs on every single
            suggestion before you ever see it.
          </p>
        </div>

        <div className={styles.grid3}>
          {TRUST.map((item) => (
            <div key={item.title} className={styles.card}>
              <span className={cn(styles.cardGlyph, styles.display)} aria-hidden>
                {item.glyph}
              </span>
              <h3 className={cn(styles.cardTitle, styles.display)}>{item.title}</h3>
              <p className={styles.cardBody}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* The emotional centre. Most air, plainest words, one object in shot. */
export function Moment() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionHead}>
          <p className={cn(styles.eyebrow, styles.eyebrowAmber)}>The moment this is for</p>
          <h2 className={cn(styles.h2, styles.display)}>
            A recruiter calls. You applied five weeks ago. You cannot remember which CV
            you sent, and the job post is gone from the site.
          </h2>
          <p className={styles.sectionLede}>
            Every other tool stops at &ldquo;hit send&rdquo;. Aptly follows you into the
            part that decides the outcome — so you open one screen instead of stalling.
          </p>
        </div>

        <div className={styles.ready}>
          <div className={styles.readyHead}>
            <span className={styles.readyTag}>Recruiter-ready</span>
            <p className={cn(styles.readyCompany, styles.display)}>Acme Robotics</p>
          </div>
          <div className={styles.readyField}>
            <p className={styles.readyKey}>CV you sent</p>
            <p className={styles.readyVal}>Aman_SPM_Acme_v3.pdf</p>
          </div>
          <div className={styles.readyField}>
            <p className={styles.readyKey}>Why you fit</p>
            <p className={styles.readyVal}>
              Led a hardware-plus-software launch; cut ramp time by half.
            </p>
          </div>
          <div className={styles.readyField}>
            <p className={styles.readyKey}>Gaps to own</p>
            <p className={cn(styles.readyVal, styles.readyValAmber)}>
              Team size was 6, not 10+. Frame scope honestly.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const PLANS = [
  {
    key: "free",
    label: "Free",
    price: "$0",
    unit: "",
    note: "Enough to feel whether this helps you.",
    features: [
      "A few tailorings a month",
      "Every format: .docx, .pdf, .tex, .txt",
      "The full no-fabrication check",
      "Records you save by hand",
    ],
    cta: "Start tailoring",
    featured: false,
  },
  {
    key: "pro",
    label: "Pro",
    price: "$16",
    unit: "/ month",
    note: "For a real search, where every call matters.",
    features: [
      "Unlimited tailoring",
      "Recruiter-Ready Card",
      "Story Bank and Gap Coach",
      "Predicted interview questions",
      "Follow-up reminders and contact log",
      "Version history with rollback",
    ],
    cta: "Start tailoring",
    featured: true,
  },
  {
    key: "week",
    label: "Week pass",
    price: "$5",
    unit: "/ 7 days",
    note: "For one application that matters this week.",
    features: ["Everything in Pro", "Seven days, no subscription", "Your records stay after it ends"],
    cta: "Start tailoring",
    featured: false,
  },
];

/* Payments are not built yet, so every button goes to the product rather than
   to a checkout that does not exist, and the page says so. */
export function Pricing() {
  return (
    <section id="pricing" className={cn(styles.section, styles.sectionMist)}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Pricing</p>
          <h2 className={cn(styles.h2, styles.display)}>
            One honest profile.
            <br />
            Every application.
          </h2>
          <p className={styles.sectionLede}>
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
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Link href="/tailor" className={cn(styles.planCta, plan.featured && styles.planCtaFeatured)}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className={styles.planFoot}>
          Paid plans are not live yet — tailoring is free while they are being built. No
          card, no waitlist.
        </p>
      </div>
    </section>
  );
}

const QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: "Will it invent things about my experience?",
    a: "No, and not because it was asked politely. Every suggestion must quote the line it came from, and a check runs afterwards on all of them: any figure, company or technology not already in your CV means the suggestion is discarded before it reaches you. You will sometimes see a count of what was thrown away — that count is the feature working.",
  },
  {
    q: "What happens to my CV? Is it stored?",
    a: "Nothing is saved until you ask. You can tailor a CV with no account at all, and the file stays in your browser. When you do save an application it is yours alone, and there is a plain control to export or delete everything.",
  },
  {
    q: "Which file formats can I use?",
    a: ".docx, .pdf, .tex, .txt and .md. For .docx and .tex the edits go into your own file, so your formatting survives exactly. A .pdf cannot be edited in place — text in a PDF has no reflow — so Aptly measures your fonts, spacing and layout and rebuilds a close copy. It tells you when it has done that.",
  },
  {
    q: "Why does it sometimes suggest nothing?",
    a: "Because for that section there was nothing worth changing, and saying so is more useful than inventing edits. If a whole run comes back empty on a job you know you half-match, that is a bug rather than modesty.",
  },
  {
    q: "Does a higher keyword score mean I will get the interview?",
    a: "No, and tools implying otherwise are selling you something. Aptly reports coverage honestly, including a low number, and never repeats a term to inflate it. A CV that games a filter and then falls apart in the room has not helped you.",
  },
  {
    q: "What is the Recruiter-Ready Card?",
    a: "One screen for the phone call: the CV you sent, the job post as it was on the day, why you fit, your talking points, the questions to expect, and the gaps to own honestly. It is the part no other tool covers, and what the whole record exists to make possible.",
  },
  {
    q: "Can it delete parts of my CV to make it fit?",
    a: "It cannot. Tailoring here is emphasis, not subtraction. A skills line can be reordered to lead with what the job asks for, but it may not come back shorter than it went in — you still know C++ even when this particular advert never mentions it.",
  },
  {
    q: "Do I need an account?",
    a: "Not to tailor. Only to keep things. If you save something first and sign in afterwards, the work comes with you rather than being lost.",
  },
];

export function Faq() {
  const columns = [QUESTIONS.slice(0, 4), QUESTIONS.slice(4)];
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>FAQ</p>
          <h2 className={cn(styles.h2, styles.display)}>Frequently asked questions</h2>
          <p className={styles.sectionLede}>Including the parts Aptly cannot do.</p>
        </div>

        <div className={styles.faq}>
          {columns.map((column, c) => (
            <div key={c} className={styles.faqCol}>
              {column.map((item, i) => (
                <details key={item.q} className={styles.faqItem} open={c === 0 && i === 0}>
                  <summary>{item.q}</summary>
                  <p className={styles.faqBody}>{item.a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section className={cn(styles.section, styles.sectionMist, styles.closing)}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionHead}>
          <h2 className={cn(styles.h2, styles.display)}>
            Start with the job you are applying to today.
          </h2>
          <div className={styles.ctaRow}>
            <Link href="/tailor" className={styles.cta}>
              Get your free score →
            </Link>
          </div>
          <p className={styles.ctaNote}>Takes about a minute. No sign-up to see it.</p>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  {
    heading: "Product",
    links: [
      { label: "Tailor a CV", href: "/tailor" },
      { label: "Library", href: "/library" },
      { label: "How it works", href: "#story" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { label: "No fabrication", href: "#trust" },
      { label: "Your data", href: "#trust" },
      { label: "FAQ", href: "#faq" },
    ],
  },
];

const COMING = ["Story Bank", "Recruiter-Ready Card", "Gap Coach", "Browser clipper"];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        <div>
          <p className={cn(styles.footerBrand, styles.display)}>Aptly</p>
          <p className={styles.footerBlurb}>Tailor every application. Be ready when they call.</p>
        </div>

        {FOOTER_LINKS.map((column) => (
          <div key={column.heading}>
            <p className={styles.footerHead}>{column.heading}</p>
            <ul className={styles.footerList}>
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className={styles.footerHead}>Coming next</p>
          <ul className={styles.footerList}>
            {COMING.map((item) => (
              <li key={item}>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <p>Nothing is stored until you ask. Export or delete everything, any time.</p>
        <p>Built around one moment: the callback.</p>
      </div>

      <p aria-hidden className={cn(styles.watermark, styles.display)}>
        Aptly
      </p>
    </footer>
  );
}
