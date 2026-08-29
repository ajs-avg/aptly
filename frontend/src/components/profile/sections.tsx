"use client";

import { useState } from "react";

import { AddButton, Card, Chips, Field, Select, TextArea, Toggle } from "./fields";
import { cn } from "@/lib/utils";
import type {
  Achievement,
  Award,
  CareerProfile,
  Certification,
  Education,
  Identity,
  Preferences,
  ProfileLanguage,
  ProfileProject,
  Publication,
  Role,
  Skill,
  Volunteering,
} from "@/lib/types";

/**
 * One editor per section of the career profile.
 *
 * Separate on purpose. The schema has eight repeating sections and something
 * like forty fields, and put on one page as a single form it is a wall nobody
 * finishes — the thing somebody came to change is always below the fold, and
 * the sections that matter most to a rebuild are the ones people give up
 * before reaching.
 *
 * Each section is its own screen, reachable directly, so "add the certification
 * I just passed" is two clicks rather than a scroll through a job history.
 *
 * Every editor takes its slice and a setter for that slice, so none of them
 * knows about the profile as a whole and none can corrupt a part it does not
 * own.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   Identity
   ═══════════════════════════════════════════════════════════════════════════ */

export function IdentitySection({
  value,
  onChange,
}: {
  value: Identity;
  onChange: (value: Identity) => void;
}) {
  const set = <K extends keyof Identity>(key: K, next: Identity[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" value={value.full_name} onChange={(v) => set("full_name", v)} />
      <Field
        label="Headline"
        value={value.headline}
        onChange={(v) => set("headline", v)}
        placeholder="Senior Product Manager"
        hint="What you already call yourself. Never invented for you."
      />
      <Field label="Email" type="email" value={value.email} onChange={(v) => set("email", v)} />
      <Field label="Phone" value={value.phone} onChange={(v) => set("phone", v)} />
      <Field
        label="Location"
        value={value.location}
        onChange={(v) => set("location", v)}
        placeholder="Bengaluru, India"
      />
      <Field
        label="Work authorisation"
        value={value.work_authorisation}
        onChange={(v) => set("work_authorisation", v)}
        placeholder="Indian citizen · UK work visa"
      />
      <Chips
        label="Links"
        values={value.links}
        onChange={(v) => set("links", v)}
        placeholder="linkedin.com/in/…"
      />
      <Toggle
        label="Open to relocating"
        checked={value.open_to_relocation}
        onChange={(v) => set("open_to_relocation", v)}
      />
      <TextArea
        label="Summary"
        value={value.summary}
        onChange={(v) => set("summary", v)}
        rows={4}
        hint="In your own words. A rebuilt CV may rephrase this; it may not go beyond it."
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Experience — the section that decides most rebuilds
   ═══════════════════════════════════════════════════════════════════════════ */

const EMPTY_ROLE: Role = {
  title: "",
  company: "",
  location: "",
  start: "",
  end: "",
  is_current: false,
  employment_type: "",
  team_size: "",
  reported_to: "",
  what_you_did: "",
  achievements: [],
  technologies: [],
  reason_for_leaving: "",
};

export function ExperienceSection({
  value,
  onChange,
}: {
  value: Role[];
  onChange: (value: Role[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);

  const patch = (index: number, next: Partial<Role>) =>
    onChange(value.map((role, i) => (i === index ? { ...role, ...next } : role)));

  return (
    <div className="grid gap-3">
      {value.map((role, index) => (
        <Card
          key={index}
          title={role.title}
          subtitle={[role.company, [role.start, role.end || (role.is_current ? "Present" : "")]
            .filter(Boolean)
            .join(" – ")]
            .filter(Boolean)
            .join("  ·  ")}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Job title" value={role.title} onChange={(v) => patch(index, { title: v })} />
          <Field label="Employer" value={role.company} onChange={(v) => patch(index, { company: v })} />
          <Field label="Location" value={role.location} onChange={(v) => patch(index, { location: v })} />
          <Field
            label="Employment type"
            value={role.employment_type}
            onChange={(v) => patch(index, { employment_type: v })}
            placeholder="Full-time · Contract · Internship"
          />
          <Field
            label="Started"
            value={role.start}
            onChange={(v) => patch(index, { start: v })}
            placeholder="March 2021"
          />
          <Field
            label="Ended"
            value={role.end}
            onChange={(v) => patch(index, { end: v })}
            placeholder="Leave empty if current"
          />
          <Field
            label="Team size"
            value={role.team_size}
            onChange={(v) => patch(index, { team_size: v })}
            placeholder="6 engineers"
            hint="A number here is worth a paragraph elsewhere."
          />
          <Field
            label="Reported to"
            value={role.reported_to}
            onChange={(v) => patch(index, { reported_to: v })}
            placeholder="VP Product"
          />
          <Toggle
            label="I still work here"
            checked={role.is_current}
            onChange={(v) => patch(index, { is_current: v })}
          />
          <TextArea
            label="What you did"
            value={role.what_you_did}
            onChange={(v) => patch(index, { what_you_did: v })}
            rows={3}
            hint="The role overall, in your register. Not the bullets — those are below."
          />
          <Chips
            label="Technologies"
            values={role.technologies}
            onChange={(v) => patch(index, { technologies: v })}
          />

          <AchievementList
            value={role.achievements}
            onChange={(v) => patch(index, { achievements: v })}
          />
        </Card>
      ))}

      <AddButton onClick={() => { onChange([...value, { ...EMPTY_ROLE }]); setOpen(value.length); }}>
        Add a role
      </AddButton>
    </div>
  );
}

/**
 * The achievements under one role.
 *
 * `metric` is its own field rather than something read back out of the
 * sentence. Scoring reads it directly, and a number sitting in prose is a
 * number a regex has to go looking for — which it will sometimes find in the
 * wrong place, and sometimes miss entirely.
 */
function AchievementList({
  value,
  onChange,
}: {
  value: Achievement[];
  onChange: (value: Achievement[]) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <p className="pb-2 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
        Achievements
      </p>
      <div className="grid gap-2.5">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg bg-sunken p-3 ring-1 ring-hairline">
            <div className="flex items-start gap-2">
              <textarea
                rows={2}
                value={item.text}
                placeholder="Cut new-site ramp time from 12 weeks to 6 by rebuilding onboarding."
                onChange={(event) =>
                  onChange(
                    value.map((a, i) => (i === index ? { ...a, text: event.target.value } : a)),
                  )
                }
                className="min-w-0 flex-1 resize-y rounded-md bg-raised px-3 py-2 text-[1rem] leading-relaxed text-ink ring-1 ring-hairline placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label="Remove achievement"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-slate transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="grid gap-3 pt-2.5 sm:grid-cols-2">
              <Field
                label="The number"
                value={item.metric}
                placeholder="12 weeks → 6"
                onChange={(v) =>
                  onChange(value.map((a, i) => (i === index ? { ...a, metric: v } : a)))
                }
              />
              <Chips
                label="Skills used"
                values={item.skills_used}
                onChange={(v) =>
                  onChange(value.map((a, i) => (i === index ? { ...a, skills_used: v } : a)))
                }
              />
            </div>
          </div>
        ))}
        <AddButton
          onClick={() => onChange([...value, { text: "", metric: "", skills_used: [] }])}
        >
          Add an achievement
        </AddButton>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Education
   ═══════════════════════════════════════════════════════════════════════════ */

export function EducationSection({
  value,
  onChange,
}: {
  value: Education[];
  onChange: (value: Education[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const patch = (index: number, next: Partial<Education>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <Card
          key={index}
          title={[item.degree, item.field_of_study].filter(Boolean).join(", ")}
          subtitle={item.institution}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Degree" value={item.degree} onChange={(v) => patch(index, { degree: v })} />
          <Field
            label="Field of study"
            value={item.field_of_study}
            onChange={(v) => patch(index, { field_of_study: v })}
          />
          <Field
            label="Institution"
            value={item.institution}
            onChange={(v) => patch(index, { institution: v })}
          />
          <Field label="Location" value={item.location} onChange={(v) => patch(index, { location: v })} />
          <Field label="Started" value={item.start} onChange={(v) => patch(index, { start: v })} />
          <Field label="Ended" value={item.end} onChange={(v) => patch(index, { end: v })} />
          <Field
            label="Grade"
            value={item.grade}
            onChange={(v) => patch(index, { grade: v })}
            placeholder="8.4 CGPA · First class"
          />
          <Chips
            label="Highlights"
            values={item.highlights}
            onChange={(v) => patch(index, { highlights: v })}
            hint="A thesis, a society you ran, a paper. Usable evidence, not decoration."
          />
        </Card>
      ))}
      <AddButton
        onClick={() => {
          onChange([
            ...value,
            {
              degree: "",
              field_of_study: "",
              institution: "",
              location: "",
              start: "",
              end: "",
              grade: "",
              highlights: [],
            },
          ]);
          setOpen(value.length);
        }}
      >
        Add education
      </AddButton>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Projects
   ═══════════════════════════════════════════════════════════════════════════ */

export function ProjectsSection({
  value,
  onChange,
}: {
  value: ProfileProject[];
  onChange: (value: ProfileProject[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const patch = (index: number, next: Partial<ProfileProject>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <Card
          key={index}
          title={item.name}
          subtitle={item.is_professional ? "At work" : "Personal"}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Name" value={item.name} onChange={(v) => patch(index, { name: v })} />
          <Field
            label="Your role on it"
            value={item.role}
            onChange={(v) => patch(index, { role: v })}
            hint="What you personally did, not what the team did."
          />
          <Field label="Link" value={item.link} onChange={(v) => patch(index, { link: v })} />
          <Field
            label="Outcome"
            value={item.outcome}
            onChange={(v) => patch(index, { outcome: v })}
            placeholder="400 users in the first month"
          />
          <Toggle
            label="This was part of a job"
            checked={item.is_professional}
            onChange={(v) => patch(index, { is_professional: v })}
            hint="A side project and a shipped product carry different weight to a reader."
          />
          <TextArea
            label="Description"
            value={item.description}
            onChange={(v) => patch(index, { description: v })}
          />
          <Chips
            label="Technologies"
            values={item.technologies}
            onChange={(v) => patch(index, { technologies: v })}
          />
        </Card>
      ))}
      <AddButton
        onClick={() => {
          onChange([
            ...value,
            {
              name: "",
              description: "",
              role: "",
              technologies: [],
              link: "",
              outcome: "",
              is_professional: false,
            },
          ]);
          setOpen(value.length);
        }}
      >
        Add a project
      </AddButton>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Skills
   ═══════════════════════════════════════════════════════════════════════════ */

const PROFICIENCY = [
  { value: "learning" as const, label: "Learning" },
  { value: "working" as const, label: "Working knowledge" },
  { value: "strong" as const, label: "Strong" },
  { value: "expert" as const, label: "Expert" },
];

export function SkillsSection({
  value,
  onChange,
}: {
  value: Skill[];
  onChange: (value: Skill[]) => void;
}) {
  const patch = (index: number, next: Partial<Skill>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-slate">
        Rate these honestly. A rebuilt CV leads with what you are strong at, and
        an inflated rating is a question you have to answer in an interview.
      </p>

      {value.map((skill, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-xl bg-raised p-3 ring-1 ring-hairline sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end"
        >
          <Field label="Skill" value={skill.name} onChange={(v) => patch(index, { name: v })} />
          <Select
            label="Level"
            value={skill.proficiency}
            options={PROFICIENCY}
            onChange={(v) => patch(index, { proficiency: v })}
          />
          <Field
            label="Years"
            value={skill.years}
            onChange={(v) => patch(index, { years: v })}
            placeholder="4"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove ${skill.name || "skill"}`}
            className="grid h-11 w-full shrink-0 place-items-center rounded-lg text-slate transition-colors hover:bg-danger-soft hover:text-danger sm:w-11"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 0 .5 12h7l.5-12" />
            </svg>
          </button>
        </div>
      ))}

      <AddButton
        onClick={() =>
          onChange([
            ...value,
            { name: "", category: "", proficiency: "working", years: "", last_used: "" },
          ])
        }
      >
        Add a skill
      </AddButton>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   The short ones
   ═══════════════════════════════════════════════════════════════════════════ */

export function CertificationsSection({
  value,
  onChange,
}: {
  value: Certification[];
  onChange: (value: Certification[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const patch = (index: number, next: Partial<Certification>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <Card
          key={index}
          title={item.name}
          subtitle={[item.issuer, item.issued].filter(Boolean).join("  ·  ")}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Name" value={item.name} onChange={(v) => patch(index, { name: v })} />
          <Field label="Issuer" value={item.issuer} onChange={(v) => patch(index, { issuer: v })} />
          <Field label="Issued" value={item.issued} onChange={(v) => patch(index, { issued: v })} />
          <Field label="Expires" value={item.expires} onChange={(v) => patch(index, { expires: v })} />
          <Field
            label="Credential ID"
            value={item.credential_id}
            onChange={(v) => patch(index, { credential_id: v })}
            wide
          />
        </Card>
      ))}
      <AddButton
        onClick={() => {
          onChange([
            ...value,
            { name: "", issuer: "", issued: "", expires: "", credential_id: "" },
          ]);
          setOpen(value.length);
        }}
      >
        Add a certification
      </AddButton>
    </div>
  );
}

export function LanguagesSection({
  value,
  onChange,
}: {
  value: ProfileLanguage[];
  onChange: (value: ProfileLanguage[]) => void;
}) {
  const patch = (index: number, next: Partial<ProfileLanguage>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-xl bg-raised p-3 ring-1 ring-hairline sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <Field label="Language" value={item.name} onChange={(v) => patch(index, { name: v })} />
          <Field
            label="Level"
            value={item.level}
            onChange={(v) => patch(index, { level: v })}
            placeholder="Native · Fluent · Professional"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove ${item.name || "language"}`}
            className="grid h-11 w-full place-items-center rounded-lg text-slate transition-colors hover:bg-danger-soft hover:text-danger sm:w-11"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 0 .5 12h7l.5-12" />
            </svg>
          </button>
        </div>
      ))}
      <AddButton onClick={() => onChange([...value, { name: "", level: "" }])}>
        Add a language
      </AddButton>
    </div>
  );
}

export function AwardsSection({
  value,
  onChange,
}: {
  value: Award[];
  onChange: (value: Award[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const patch = (index: number, next: Partial<Award>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <Card
          key={index}
          title={item.name}
          subtitle={[item.issuer, item.date].filter(Boolean).join("  ·  ")}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Award" value={item.name} onChange={(v) => patch(index, { name: v })} />
          <Field label="Issuer" value={item.issuer} onChange={(v) => patch(index, { issuer: v })} />
          <Field label="Date" value={item.date} onChange={(v) => patch(index, { date: v })} />
          <TextArea
            label="What it was for"
            value={item.description}
            onChange={(v) => patch(index, { description: v })}
            rows={2}
          />
        </Card>
      ))}
      <AddButton
        onClick={() => {
          onChange([...value, { name: "", issuer: "", date: "", description: "" }]);
          setOpen(value.length);
        }}
      >
        Add an award
      </AddButton>
    </div>
  );
}

export function PublicationsSection({
  value,
  onChange,
}: {
  value: Publication[];
  onChange: (value: Publication[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const patch = (index: number, next: Partial<Publication>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <Card
          key={index}
          title={item.title}
          subtitle={[item.venue, item.date].filter(Boolean).join("  ·  ")}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Title" value={item.title} onChange={(v) => patch(index, { title: v })} wide />
          <Field label="Venue" value={item.venue} onChange={(v) => patch(index, { venue: v })} />
          <Field label="Date" value={item.date} onChange={(v) => patch(index, { date: v })} />
          <Field label="Link" value={item.link} onChange={(v) => patch(index, { link: v })} wide />
          <TextArea
            label="Description"
            value={item.description}
            onChange={(v) => patch(index, { description: v })}
            rows={2}
          />
        </Card>
      ))}
      <AddButton
        onClick={() => {
          onChange([...value, { title: "", venue: "", date: "", link: "", description: "" }]);
          setOpen(value.length);
        }}
      >
        Add a publication
      </AddButton>
    </div>
  );
}

export function VolunteeringSection({
  value,
  onChange,
}: {
  value: Volunteering[];
  onChange: (value: Volunteering[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const patch = (index: number, next: Partial<Volunteering>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="grid gap-3">
      {value.map((item, index) => (
        <Card
          key={index}
          title={item.role}
          subtitle={item.organisation}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Field label="Role" value={item.role} onChange={(v) => patch(index, { role: v })} />
          <Field
            label="Organisation"
            value={item.organisation}
            onChange={(v) => patch(index, { organisation: v })}
          />
          <Field label="Started" value={item.start} onChange={(v) => patch(index, { start: v })} />
          <Field label="Ended" value={item.end} onChange={(v) => patch(index, { end: v })} />
          <TextArea
            label="What you did"
            value={item.description}
            onChange={(v) => patch(index, { description: v })}
            rows={2}
          />
        </Card>
      ))}
      <AddButton
        onClick={() => {
          onChange([
            ...value,
            { organisation: "", role: "", start: "", end: "", description: "" },
          ]);
          setOpen(value.length);
        }}
      >
        Add volunteering
      </AddButton>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   What they want — read by the rebuild, never printed as a claim
   ═══════════════════════════════════════════════════════════════════════════ */

const WORK_STYLE = [
  { value: "no_preference" as const, label: "No preference" },
  { value: "remote" as const, label: "Remote" },
  { value: "hybrid" as const, label: "Hybrid" },
  { value: "onsite" as const, label: "On site" },
];

export function PreferencesSection({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  const set = <K extends keyof Preferences>(key: K, next: Preferences[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p className="text-sm leading-relaxed text-slate sm:col-span-2">
        This shapes what a rebuilt CV leads with. None of it is ever printed on
        the document or shown to an employer.
      </p>
      <Chips
        label="Roles you want"
        values={value.target_roles}
        onChange={(v) => set("target_roles", v)}
      />
      <Chips
        label="Industries"
        values={value.target_industries}
        onChange={(v) => set("target_industries", v)}
      />
      <Field
        label="Seniority"
        value={value.seniority}
        onChange={(v) => set("seniority", v)}
        placeholder="Senior · Lead · Director"
      />
      <Select
        label="Work style"
        value={value.work_style}
        options={WORK_STYLE}
        onChange={(v) => set("work_style", v)}
      />
      <Field
        label="Notice period"
        value={value.notice_period}
        onChange={(v) => set("notice_period", v)}
      />
      <Field
        label="Salary expectation"
        value={value.salary_expectation}
        onChange={(v) => set("salary_expectation", v)}
      />
      <Chips label="Locations" values={value.locations} onChange={(v) => set("locations", v)} />
      <Chips
        label="Do not put me forward for"
        values={value.avoid}
        onChange={(v) => set("avoid", v)}
        hint="Respected by the rebuild."
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   The catch-all
   ═══════════════════════════════════════════════════════════════════════════ */

export function NotesSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-relaxed text-slate">
        Anything that did not fit a field above. Half-finished thoughts count —
        this is read as source material, so something you write here badly is
        still something a rebuilt CV is allowed to draw on. Nothing you leave
        out can be.
      </p>
      <TextArea
        label="Notes"
        value={value}
        onChange={onChange}
        rows={10}
        placeholder="The migration nobody put on my CV. The team I inherited at 3 and grew to 11. The talk I gave at the internal conference…"
      />
    </div>
  );
}

/** Every section, in the order the page shows them. */
export const PROFILE_SECTIONS = [
  { key: "identity", label: "About you" },
  { key: "roles", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "projects", label: "Projects" },
  { key: "skills", label: "Skills" },
  { key: "certifications", label: "Certifications" },
  { key: "languages", label: "Languages" },
  { key: "awards", label: "Awards" },
  { key: "publications", label: "Publications" },
  { key: "volunteering", label: "Volunteering" },
  { key: "preferences", label: "What you want" },
  { key: "notes", label: "Anything else" },
] as const;

export type SectionKey = (typeof PROFILE_SECTIONS)[number]["key"];

/** How many entries a section holds, for the count beside its name. */
export function sectionCount(profile: CareerProfile, key: SectionKey): number {
  switch (key) {
    case "identity":
      return [
        profile.identity.full_name,
        profile.identity.headline,
        profile.identity.email,
        profile.identity.summary,
      ].filter(Boolean).length;
    case "preferences":
      return [
        ...profile.preferences.target_roles,
        ...profile.preferences.locations,
        profile.preferences.seniority,
      ].filter(Boolean).length;
    case "notes":
      return profile.notes.trim() ? 1 : 0;
    default:
      return (profile[key] as unknown[]).length;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Getting between them
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The section list, with a count beside each name.
 *
 * The counts are the point. A profile is never "done", so a list of twelve
 * identical links tells somebody nothing about where to spend the next two
 * minutes — whereas "Certifications 0" beside "Experience 4" says it outright.
 * It reads as an inventory of what Aptly knows rather than as navigation.
 */
export function ProfileSectionsNav({
  profile,
  active,
  onSelect,
}: {
  profile: CareerProfile;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <nav
      aria-label="Profile sections"
      // Horizontally scrolling strip on a phone, a column from `lg`. A
      // twelve-item vertical list above the content would be a screen of
      // navigation before anything editable.
      className="no-scrollbar scroll-x -mx-1 flex gap-1.5 px-1 lg:sticky lg:top-[calc(var(--spacing-bar)+1rem)] lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
    >
      {PROFILE_SECTIONS.map((section) => {
        const count = sectionCount(profile, section.key);
        const current = section.key === active;
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onSelect(section.key)}
            aria-current={current ? "true" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left font-display text-sm transition-colors lg:w-full",
              current
                ? "bg-raised text-ink shadow-hairline"
                : "text-slate hover:bg-raised/60 hover:text-ink",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
            <span
              className={cn(
                "shrink-0 rounded-pill px-1.5 py-0.5 font-display text-2xs",
                count > 0 ? "bg-signal-soft text-signal" : "text-slate/50",
              )}
              data-numeric
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
