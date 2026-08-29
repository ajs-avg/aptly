"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import { EASE, SPRING } from "@/components/motion/primitives";
import { ImportPanel } from "@/components/profile/ImportPanel";
import {
  AwardsSection,
  CertificationsSection,
  EducationSection,
  ExperienceSection,
  IdentitySection,
  LanguagesSection,
  NotesSection,
  PreferencesSection,
  ProfileSectionsNav,
  ProjectsSection,
  PublicationsSection,
  SkillsSection,
  VolunteeringSection,
} from "@/components/profile/sections";
import { PROFILE_SECTIONS, sectionCount, type SectionKey } from "@/components/profile/sections";
import { ApiError, getProfile, saveProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CareerProfile } from "@/lib/types";

/**
 * Everything the person has told us about their career.
 *
 * This is the thing that makes a rebuilt CV better than the document it came
 * from. One CV holds what fitted on two pages; this holds the career, and the
 * no-fabrication checker pools it with the uploaded file — so every line added
 * here widens what a rebuild is *allowed* to say without loosening the rule
 * that it may only say true things.
 *
 * Which is why the page is built to be added to rather than merely filled in.
 * The sections are separate screens with their own counts, so "add the
 * certification I passed on Tuesday" is two clicks and not a scroll through six
 * jobs; and the empty state of every section says what it would buy rather than
 * that it is empty.
 */
function ProfileScreen() {
  const params = useSearchParams();
  /**
   * Just created an account.
   *
   * The importer opens by itself and the page says so, because somebody who has
   * signed up thirty seconds ago has an empty profile and no reason yet to
   * believe filling it in is worth their time. Nothing is blocked: every
   * section is editable, and leaving is a click.
   */
  const welcome = params.get("welcome") === "1";
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [section, setSection] = useState<SectionKey>("identity");
  const [completeness, setCompleteness] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Whether what is on screen differs from what is saved.
   *
   * Tracked rather than saving on every keystroke: this form is forty fields
   * and a PUT per character would be both wasteful and a race. The trade is
   * that leaving with unsaved work has to be caught — see the beforeunload
   * below.
   */
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getProfile()
      .then((response) => {
        setProfile(response.profile);
        setCompleteness(response.completeness);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : "Could not open your profile."),
      );
  }, []);

  // A profile is worth more than a form: somebody who has spent ten minutes
  // writing up an achievement and then closes the tab should be asked.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = useCallback((next: CareerProfile) => {
    setProfile(next);
    setDirty(true);
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const response = await saveProfile(profile);
      setCompleteness(response.completeness);
      setDirty(false);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2600);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }, [profile]);

  if (!profile) {
    return (
      <div className="min-h-dvh bg-mist">
        <AppBar brandHref="/" context="Profile" width="content" />
        {error && (
          <div className="gutter-bar mx-auto max-w-content pt-4">
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-mist">
      <AppBar brandHref="/" context="Profile" width="content">
        <BarLink href="/tailor">Tailor a CV</BarLink>
        <BarLink href="/library">Library</BarLink>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className={cn(
            "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 font-display text-xs font-medium transition-colors",
            dirty
              ? "bg-signal text-paper hover:bg-signal-hover"
              : "bg-sunken text-slate",
          )}
        >
          {saving ? "Saving…" : dirty ? "Save changes" : saved ? "Saved" : "Saved"}
        </button>
      </AppBar>

      <main className="gutter mx-auto max-w-content pb-24 pt-8">
        <header className="pb-8">
          <h1
            className="font-display font-semibold tracking-[-0.03em] text-ink"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.08 }}
          >
            {welcome ? "Let Aptly read your CV" : "Your career, not just your CV"}
          </h1>
          <p className="max-w-xl pt-3 text-base leading-relaxed text-slate">
            {welcome
              ? "Drop a resume and it fills this in for you — you check it before anything is saved. Or skip it and add things by hand whenever you like."
              : "A CV holds what fitted on two pages. This holds everything — and Aptly may only write what you have told it, so anything you add here is something a tailored CV is allowed to use. Anything you leave out, it cannot."}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-6">
            <div className="min-w-[12rem] flex-1">
              <div className="flex items-baseline justify-between pb-1.5">
                <span className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                  How much Aptly knows
                </span>
                <span className="font-display text-xs text-ink" data-numeric>
                  {completeness}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pill bg-hairline">
                <motion.div
                  className="h-full rounded-pill bg-signal"
                  initial={false}
                  animate={{ width: `${completeness}%` }}
                  transition={SPRING}
                />
              </div>
            </div>
          </div>
        </header>

        <ImportPanel
          startOpen={welcome}
          onImported={(next, newCompleteness) => {
            setProfile(next);
            setCompleteness(newCompleteness);
            setDirty(true);
          }}
        />

        <div className="grid gap-6 pt-8 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-10">
          <ProfileSectionsNav
            profile={profile}
            active={section}
            onSelect={setSection}
          />

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.section
                key={section}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={EASE}
              >
                <h2 className="pb-5 font-display text-xl font-semibold tracking-tight text-ink">
                  {PROFILE_SECTIONS.find((item) => item.key === section)?.label}
                </h2>
                <Editor section={section} profile={profile} onChange={update} />
              </motion.section>
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              role="alert"
              className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-sm rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger shadow-float"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </main>

      {/* A save bar that only exists when there is something to save. Fixed,
          because the thing being edited is long and the button belonging to it
          should not be a scroll away. */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={SPRING}
            className="gutter-bar fixed inset-x-0 bottom-0 z-30 pb-4"
          >
            <div className="mx-auto flex max-w-content items-center gap-3 rounded-pill bg-raised/95 px-4 py-2.5 shadow-float ring-1 ring-ink/5 backdrop-blur-xl">
              <p className="min-w-0 flex-1 truncate text-sm text-slate">
                Unsaved changes
              </p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill bg-signal px-4 font-display text-xs font-medium text-paper transition-colors hover:bg-signal-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Editor({
  section,
  profile,
  onChange,
}: {
  section: SectionKey;
  profile: CareerProfile;
  onChange: (profile: CareerProfile) => void;
}) {
  const set = <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) =>
    onChange({ ...profile, [key]: value });

  switch (section) {
    case "identity":
      return <IdentitySection value={profile.identity} onChange={(v) => set("identity", v)} />;
    case "roles":
      return <ExperienceSection value={profile.roles} onChange={(v) => set("roles", v)} />;
    case "education":
      return <EducationSection value={profile.education} onChange={(v) => set("education", v)} />;
    case "projects":
      return <ProjectsSection value={profile.projects} onChange={(v) => set("projects", v)} />;
    case "skills":
      return <SkillsSection value={profile.skills} onChange={(v) => set("skills", v)} />;
    case "certifications":
      return (
        <CertificationsSection
          value={profile.certifications}
          onChange={(v) => set("certifications", v)}
        />
      );
    case "languages":
      return <LanguagesSection value={profile.languages} onChange={(v) => set("languages", v)} />;
    case "awards":
      return <AwardsSection value={profile.awards} onChange={(v) => set("awards", v)} />;
    case "publications":
      return (
        <PublicationsSection value={profile.publications} onChange={(v) => set("publications", v)} />
      );
    case "volunteering":
      return (
        <VolunteeringSection value={profile.volunteering} onChange={(v) => set("volunteering", v)} />
      );
    case "preferences":
      return (
        <PreferencesSection value={profile.preferences} onChange={(v) => set("preferences", v)} />
      );
    case "notes":
      return <NotesSection value={profile.notes} onChange={(v) => set("notes", v)} />;
  }
}

export default function Page() {
  return (
    <RequireAccount>
      {/* `useSearchParams` needs a boundary, and the fallback is the page's own
          ground rather than a spinner — this resolves in a frame. */}
      <Suspense fallback={<div className="min-h-dvh bg-mist" />}>
        <ProfileScreen />
      </Suspense>
    </RequireAccount>
  );
}

/** Kept out of the render path above; only used for the count in the nav. */
export { sectionCount };
