import type { RecordSummary, ShapeLine } from "./types";

/**
 * The demo pair's CV, as the first lines a card shows.
 *
 * One document, drawn everywhere a sample is needed: the landing page's
 * Library frame, the ghost shelf a new account sees, the empty profile. It is
 * the same CV the hero and the room carry, so every sample in the product is
 * the same person.
 */
export const DEMO_CV_LINES: ShapeLine[] = [
  { w: 46, k: "n", t: "Rahul Menon" },
  { w: 70, k: "c", t: "Frontend Developer · rahul.menon@example.com · Bengaluru" },
  { w: 30, k: "h", t: "Professional summary" },
  { w: 100, k: "b", t: "Frontend developer with three years building customer-facing web applications. Comfortable owning a feature from design handoff through to production." },
  { w: 26, k: "h", t: "Technical skills" },
  { w: 62, k: "b", t: "Languages: JavaScript, TypeScript, Python, HTML5, CSS3" },
  { w: 70, k: "b", t: "Backend & Data: Node.js, Express.js, REST APIs, PostgreSQL, SQL" },
  { w: 28, k: "h", t: "Work experience" },
  { w: 66, k: "r", t: "Frontend Developer · Kalyra Commerce · 2023 – Present" },
  { w: 94, k: "b", t: "Rebuilt the product listing page in Next.js, cutting time to first paint from 4.1 seconds to 1.3." },
  { w: 100, k: "b", t: "Wrote the SQL queries behind the internal pricing dashboard, pulling from PostgreSQL, and the React interface that displays them." },
  { w: 88, k: "b", t: "Wrote a Python script that reconciles the nightly product feed against the catalogue." },
  { w: 60, k: "r", t: "Junior Developer · Orbis Labs · 2021 – 2023" },
  { w: 74, k: "b", t: "Shipped the customer account pages and the checkout form validation." },
  { w: 20, k: "h", t: "Education" },
  { w: 72, k: "b", t: "B.E. Computer Science · Visvesvaraya Technological University · 2021" },
];

/** A second CV, for the shelf to have more than one face on it. */
export const DEMO_CV_LINES_B: ShapeLine[] = [
  { w: 46, k: "n", t: "Aman Sharma" },
  { w: 70, k: "c", t: "Senior Product Manager · aman@example.com · Pune" },
  { w: 20, k: "h", t: "Summary" },
  { w: 100, k: "b", t: "Product manager with six years across hardware-plus-software launches, from research through release." },
  { w: 22, k: "h", t: "Experience" },
  { w: 66, k: "r", t: "Product Manager · Veltrix Devices · 2021 – Present" },
  { w: 92, k: "b", t: "Led a hardware-plus-software launch across a team of 6, cutting customer ramp time by half." },
  { w: 80, k: "b", t: "Owned the onboarding flow end to end, from research through release." },
  { w: 70, k: "b", t: "Ran weekly reviews with engineering, design and support." },
  { w: 60, k: "r", t: "Associate PM · Northwind Labs · 2018 – 2021" },
  { w: 84, k: "b", t: "Shipped the analytics dashboard used by 40 enterprise accounts." },
  { w: 16, k: "h", t: "Skills" },
  { w: 76, k: "b", t: "Roadmapping, discovery interviews, SQL, Figma, Jira, experimentation" },
];

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/**
 * Three applications that do not exist, for a Library that holds none yet.
 *
 * Shown faded, as the shape of what the shelf will hold once something is
 * filed. An empty state that is a picture of the full one tells the person
 * more than a sentence about it.
 */
export const DEMO_RECORDS: RecordSummary[] = [
  {
    id: "demo-1",
    company: "Meridian Analytics",
    role: "Data Engineer",
    location: "Bengaluru",
    status: "screening",
    applied_at: ago(3),
    created_at: ago(5),
    updated_at: ago(3),
    cv_count: 2,
    keywords: ["SQL", "Python", "Airflow"],
    score: 61,
    sent_variant: "rebuilt",
    variants: ["tailored", "rebuilt"],
    cv_shape: DEMO_CV_LINES,
  },
  {
    id: "demo-2",
    company: "Acme Robotics",
    role: "Senior Product Manager",
    location: "Remote",
    status: "interviewing",
    applied_at: ago(12),
    created_at: ago(14),
    updated_at: ago(2),
    cv_count: 1,
    keywords: ["Hardware", "Launch", "Roadmap"],
    score: 72,
    sent_variant: "tailored",
    variants: ["tailored"],
    cv_shape: DEMO_CV_LINES_B,
  },
  {
    id: "demo-3",
    company: "Northwind Health",
    role: "Frontend Engineer",
    location: "Pune",
    status: "saved",
    applied_at: null,
    created_at: ago(1),
    updated_at: ago(1),
    cv_count: 1,
    keywords: ["React", "TypeScript", "Accessibility"],
    score: 58,
    sent_variant: null,
    variants: ["tailored"],
    cv_shape: DEMO_CV_LINES,
  },
];
