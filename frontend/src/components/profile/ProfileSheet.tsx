"use client";

import { motion } from "motion/react";

import { PaperFrame } from "@/components/visual/Paper";
import { PROFILE_SECTIONS, type SectionKey } from "@/components/profile/sections";
import { cn } from "@/lib/utils";
import type { CareerProfile } from "@/lib/types";

/**
 * The career profile, as the document it is for.
 *
 * It used to be twelve forms behind twelve links, and a form says nothing
 * about what it will become. This draws the profile as a CV — name at the
 * top, the roles with their achievements, the education, the skills — and
 * every section of the sheet is the way into editing that section. A section
 * with nothing in it shows, faintly, what one looks like filled in.
 */

interface Props {
  profile: CareerProfile;
  active: SectionKey | null;
  onPick: (key: SectionKey) => void;
  /** How much of what a rebuild needs is here, 0–100. Fills the sheet's edge. */
  completeness: number;
}

/* ── What an empty section looks like filled in, in a sample's words ─────── */

const SAMPLE: Record<SectionKey, { lines: string[]; bullets?: string[] }> = {
  identity: {
    lines: ["Rahul Menon", "Frontend Developer · rahul.menon@example.com · Bengaluru"],
    bullets: [
      "Frontend developer with three years building customer-facing web applications. Comfortable owning a feature from design handoff through to production.",
    ],
  },
  roles: {
    lines: ["Frontend Developer · Kalyra Commerce · 2023 – Present"],
    bullets: [
      "Rebuilt the product listing page in Next.js, cutting time to first paint from 4.1 seconds to 1.3.",
      "Wrote the SQL queries behind the internal pricing dashboard, pulling from PostgreSQL.",
    ],
  },
  education: { lines: ["B.E. Computer Science · Visvesvaraya Technological University · 2017 – 2021"] },
  projects: {
    lines: ["Catalogue reconciler · Python"],
    bullets: ["A script that reconciles the nightly product feed against the catalogue, replacing a two-hour manual check."],
  },
  skills: { lines: ["JavaScript · TypeScript · Python · React · Next.js · PostgreSQL · SQL"] },
  certifications: { lines: ["AWS Certified Cloud Practitioner · Amazon Web Services · 2024"] },
  languages: { lines: ["English — fluent · Hindi — native · Kannada — conversational"] },
  awards: { lines: ["Internal hackathon, first place · Kalyra Commerce · 2024"] },
  publications: { lines: ["Reconciling product feeds at scale · Kalyra Engineering Blog · 2024"] },
  volunteering: { lines: ["Mentor · Code for Bengaluru · 2022 – Present"] },
  preferences: { lines: ["Frontend or full-stack · Bengaluru or remote · Hybrid · 30 days' notice"] },
  notes: {
    lines: ["Anything a CV cannot hold: why you left a role, what you want next, what to steer clear of."],
  },
};

const LABEL = Object.fromEntries(PROFILE_SECTIONS.map((s) => [s.key, s.label])) as Record<SectionKey, string>;

/* ── Small helpers ─────────────────────────────────────────────────────────── */

const span = (start: string, end: string, current = false) =>
  [start, end || (current ? "Present" : "")].filter(Boolean).join(" – ");

const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join("  ·  ");

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-hairline pb-1 font-display text-2xs font-medium uppercase tracking-[0.12em] text-slate">
      {children}
    </h3>
  );
}

function Entry({
  title,
  when,
  sub,
  body,
  bullets,
}: {
  title: string;
  when?: string;
  sub?: string;
  body?: string;
  bullets?: Array<{ text: string; mark?: string }>;
}) {
  return (
    <div className="pt-3 first:pt-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-sm font-medium text-ink">{title || "Untitled"}</p>
        {when && (
          <p className="shrink-0 text-2xs text-slate" data-numeric>
            {when}
          </p>
        )}
      </div>
      {sub && <p className="pt-0.5 text-xs text-slate">{sub}</p>}
      {body && <p className="pt-1.5 text-xs leading-relaxed text-ink/80">{body}</p>}
      {bullets && bullets.length > 0 && (
        <ul className="space-y-1 pt-1.5">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink/85">
              <span aria-hidden className="mt-[0.45rem] block size-1 shrink-0 rounded-full bg-slate" />
              <span>
                {bullet.text}
                {bullet.mark && (
                  <span className="ml-1.5 rounded-xs bg-signal-soft px-1 font-display text-[10px] font-medium text-signal">
                    {bullet.mark}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A section's worth of what-it-will-look-like, faded. */
function Ghost({ section }: { section: SectionKey }) {
  const sample = SAMPLE[section];
  return (
    <div className="pt-2 opacity-[0.38] transition-opacity group-hover:opacity-60">
      {sample.lines.map((line, i) => (
        <p key={i} className={cn("text-xs", i === 0 ? "font-display font-medium text-ink" : "pt-0.5 text-slate")}>
          {line}
        </p>
      ))}
      {sample.bullets?.map((bullet, i) => (
        <p key={i} className="flex gap-2 pt-1.5 text-xs leading-relaxed text-ink/85">
          {section !== "identity" && (
            <span aria-hidden className="mt-[0.45rem] block size-1 shrink-0 rounded-full bg-slate" />
          )}
          <span>{bullet}</span>
        </p>
      ))}
    </div>
  );
}

/** One region of the sheet: a section, and the way into editing it. */
function Block({
  section,
  active,
  empty,
  onPick,
  children,
  className,
}: {
  section: SectionKey;
  active: boolean;
  empty: boolean;
  onPick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit ${LABEL[section]}`}
      aria-pressed={active}
      data-section={section}
      onClick={onPick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "group relative -mx-3 cursor-pointer rounded-lg px-3 py-2.5 ring-1 transition-colors duration-200",
        active
          ? "bg-signal-soft/40 ring-signal/40"
          : "ring-transparent hover:bg-white/[0.03] hover:ring-hairline",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute right-2 top-2 rounded-pill px-2 py-0.5 font-display text-[10px] font-medium transition-opacity",
          active
            ? "bg-signal text-paper opacity-100"
            : "bg-raised text-slate ring-1 ring-hairline opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {active ? "Editing" : empty ? "Add" : "Edit"}
      </span>
      {children}
      {empty && (
        <span className="pointer-events-none absolute bottom-2 right-2 font-display text-[10px] uppercase tracking-[0.08em] text-slate/50">
          example
        </span>
      )}
    </div>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────────── */

export function ProfileSheet({ profile, active, onPick, completeness }: Props) {
  const id = profile.identity;
  const identityEmpty = !id.full_name && !id.headline && !id.summary && !id.email;
  const contact = join(id.email, id.phone, id.location);

  const block = (key: SectionKey, empty: boolean, children: React.ReactNode, className?: string) => (
    <Block
      key={key}
      section={key}
      active={active === key}
      empty={empty}
      onPick={() => onPick(key)}
      className={className}
    >
      {children}
    </Block>
  );

  const prefs = profile.preferences;
  const prefsEmpty =
    prefs.target_roles.length === 0 &&
    prefs.locations.length === 0 &&
    !prefs.seniority &&
    !prefs.notice_period &&
    !prefs.salary_expectation &&
    prefs.work_style === "no_preference";

  return (
    <PaperFrame tilt>
      {/* The edge fills as the profile does — the one number, drawn as ink. */}
      <motion.span
        aria-hidden
        className="absolute left-0 top-0 w-[3px] rounded-r bg-signal"
        initial={false}
        animate={{ height: `${Math.max(2, completeness)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />

      <div className="px-6 py-7 sm:px-10 sm:py-9">
        {/* ── The name block ───────────────────────────────────────────── */}
        {block(
          "identity",
          identityEmpty,
          identityEmpty ? (
            <div className="text-center">
              <p className="font-display text-xl font-medium tracking-[-0.02em] text-ink/40">Your name</p>
              <div className="mx-auto max-w-md">
                <Ghost section="identity" />
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-display text-xl font-medium tracking-[-0.02em] text-ink sm:text-2xl">
                {id.full_name || "Your name"}
              </p>
              {id.headline && <p className="pt-0.5 text-sm text-slate">{id.headline}</p>}
              {(contact || id.links.length > 0) && (
                <p className="pt-1.5 text-2xs text-slate">
                  {join(contact, ...id.links)}
                  {id.open_to_relocation && "  ·  open to relocating"}
                </p>
              )}
              {id.summary && (
                <p className="mx-auto max-w-prose pt-4 text-left text-xs leading-relaxed text-ink/85">
                  {id.summary}
                </p>
              )}
            </div>
          ),
          "text-center",
        )}

        {/* ── Experience ───────────────────────────────────────────────── */}
        {block(
          "roles",
          profile.roles.length === 0,
          <>
            <Heading>Experience</Heading>
            {profile.roles.length === 0 ? (
              <Ghost section="roles" />
            ) : (
              profile.roles.map((role, i) => (
                <Entry
                  key={i}
                  title={join(role.title, role.company)}
                  when={span(role.start, role.end, role.is_current)}
                  sub={join(role.location, role.employment_type, role.team_size && `team of ${role.team_size}`)}
                  body={role.what_you_did}
                  bullets={role.achievements.map((a) => ({ text: a.text, mark: a.metric }))}
                />
              ))
            )}
          </>,
          "mt-5",
        )}

        {/* ── Education ────────────────────────────────────────────────── */}
        {block(
          "education",
          profile.education.length === 0,
          <>
            <Heading>Education</Heading>
            {profile.education.length === 0 ? (
              <Ghost section="education" />
            ) : (
              profile.education.map((e, i) => (
                <Entry
                  key={i}
                  title={join([e.degree, e.field_of_study].filter(Boolean).join(" in "), e.institution)}
                  when={span(e.start, e.end)}
                  sub={join(e.location, e.grade)}
                  bullets={e.highlights.map((text) => ({ text }))}
                />
              ))
            )}
          </>,
          "mt-4",
        )}

        {/* ── Projects ─────────────────────────────────────────────────── */}
        {block(
          "projects",
          profile.projects.length === 0,
          <>
            <Heading>Projects</Heading>
            {profile.projects.length === 0 ? (
              <Ghost section="projects" />
            ) : (
              profile.projects.map((p, i) => (
                <Entry
                  key={i}
                  title={join(p.name, p.role)}
                  sub={join(p.technologies.join(", "), p.link)}
                  body={p.description}
                  bullets={p.outcome ? [{ text: p.outcome }] : undefined}
                />
              ))
            )}
          </>,
          "mt-4",
        )}

        {/* ── Skills ───────────────────────────────────────────────────── */}
        {block(
          "skills",
          profile.skills.length === 0,
          <>
            <Heading>Skills</Heading>
            {profile.skills.length === 0 ? (
              <Ghost section="skills" />
            ) : (
              <div className="flex flex-wrap gap-x-1 gap-y-1 pt-2">
                {profile.skills.map((skill, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-pill bg-sunken px-2 py-0.5 text-2xs text-ink/85">
                    {skill.name}
                    {(skill.proficiency === "strong" || skill.proficiency === "expert") && (
                      <span aria-hidden className="size-1 rounded-full bg-signal" />
                    )}
                  </span>
                ))}
              </div>
            )}
          </>,
          "mt-4",
        )}

        {/* ── The smaller sections, two to a row where there is room ────── */}
        <div className="grid gap-x-8 sm:grid-cols-2">
          {block(
            "certifications",
            profile.certifications.length === 0,
            <>
              <Heading>Certifications</Heading>
              {profile.certifications.length === 0 ? (
                <Ghost section="certifications" />
              ) : (
                profile.certifications.map((c, i) => (
                  <Entry key={i} title={c.name} when={c.issued} sub={join(c.issuer, c.credential_id)} />
                ))
              )}
            </>,
            "mt-4",
          )}
          {block(
            "languages",
            profile.languages.length === 0,
            <>
              <Heading>Languages</Heading>
              {profile.languages.length === 0 ? (
                <Ghost section="languages" />
              ) : (
                <p className="pt-2 text-xs text-ink/85">
                  {profile.languages.map((l) => [l.name, l.level].filter(Boolean).join(" — ")).join("  ·  ")}
                </p>
              )}
            </>,
            "mt-4",
          )}
          {block(
            "awards",
            profile.awards.length === 0,
            <>
              <Heading>Awards</Heading>
              {profile.awards.length === 0 ? (
                <Ghost section="awards" />
              ) : (
                profile.awards.map((a, i) => (
                  <Entry key={i} title={a.name} when={a.date} sub={a.issuer} body={a.description} />
                ))
              )}
            </>,
            "mt-4",
          )}
          {block(
            "publications",
            profile.publications.length === 0,
            <>
              <Heading>Publications</Heading>
              {profile.publications.length === 0 ? (
                <Ghost section="publications" />
              ) : (
                profile.publications.map((p, i) => (
                  <Entry key={i} title={p.title} when={p.date} sub={join(p.venue, p.link)} body={p.description} />
                ))
              )}
            </>,
            "mt-4",
          )}
        </div>

        {/* ── Volunteering ─────────────────────────────────────────────── */}
        {block(
          "volunteering",
          profile.volunteering.length === 0,
          <>
            <Heading>Volunteering</Heading>
            {profile.volunteering.length === 0 ? (
              <Ghost section="volunteering" />
            ) : (
              profile.volunteering.map((v, i) => (
                <Entry key={i} title={join(v.role, v.organisation)} when={span(v.start, v.end)} body={v.description} />
              ))
            )}
          </>,
          "mt-4",
        )}

        {/* ── Below the line: what a CV never says, and what you want ───── */}
        <div className="mt-6 grid gap-x-8 border-t border-dashed border-hairline pt-2 sm:grid-cols-2">
          {block(
            "preferences",
            prefsEmpty,
            <>
              <Heading>What you want</Heading>
              {prefsEmpty ? (
                <Ghost section="preferences" />
              ) : (
                <p className="pt-2 text-xs leading-relaxed text-ink/85">
                  {join(
                    prefs.target_roles.join(", "),
                    prefs.target_industries.join(", "),
                    prefs.seniority,
                    prefs.locations.join(", "),
                    prefs.work_style !== "no_preference" ? prefs.work_style : "",
                    prefs.notice_period && `${prefs.notice_period} notice`,
                    prefs.salary_expectation,
                    prefs.avoid.length > 0 && `avoid: ${prefs.avoid.join(", ")}`,
                  )}
                </p>
              )}
            </>,
            "mt-3",
          )}
          {block(
            "notes",
            !profile.notes.trim(),
            <>
              <Heading>Anything else</Heading>
              {profile.notes.trim() ? (
                <p className="whitespace-pre-wrap pt-2 text-xs leading-relaxed text-ink/85">{profile.notes}</p>
              ) : (
                <Ghost section="notes" />
              )}
            </>,
            "mt-3",
          )}
        </div>
      </div>
    </PaperFrame>
  );
}
