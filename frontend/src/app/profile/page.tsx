"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import { EASE, SPRING } from "@/components/motion/primitives";
import { ImportPanel } from "@/components/profile/ImportPanel";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import {
  AwardsSection,
  CertificationsSection,
  EducationSection,
  ExperienceSection,
  IdentitySection,
  LanguagesSection,
  NotesSection,
  PreferencesSection,
  ProjectsSection,
  PublicationsSection,
  SkillsSection,
  VolunteeringSection,
} from "@/components/profile/sections";
import { PROFILE_SECTIONS, type SectionKey } from "@/components/profile/sections";
import { ScoreRing } from "@/components/visual/ScoreRing";
import { ApiError, getProfile, saveProfile } from "@/lib/api";
import { useStage } from "@/components/stage/store";
import { cn } from "@/lib/utils";
import type { CareerProfile } from "@/lib/types";

/**
 * Everything the person has told us about their career, as the document it
 * is for.
 *
 * This is the thing that makes a rebuilt CV better than the file it came
 * from: one CV holds what fitted on two pages, this holds the career, and the
 * no-fabrication checker pools it with the uploaded file. So every line added
 * here widens what a rebuild is *allowed* to say.
 *
 * It is drawn as a CV rather than as a form, because a form says nothing
 * about what it becomes. Every section on the sheet opens its editor beside
 * it, and the sheet rewrites itself as you type.
 */
function ProfileScreen() {
  const params = useSearchParams();
  /** Just created an account: the importer opens by itself and the page says so. */
  const welcome = params.get("welcome") === "1";

  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [section, setSection] = useState<SectionKey | null>(null);
  const [completeness, setCompleteness] = useState(0);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Whether what is on screen differs from what is saved. */
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The room's sheet fills as the profile does — the same number, in paper.
  useStage("profile", { fill: Math.max(0.08, completeness / 100) });

  useEffect(() => {
    void getProfile()
      .then((response) => {
        setProfile(response.profile);
        setCompleteness(response.completeness);
        setNextSteps(response.next_steps ?? []);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : "Could not open your profile."),
      );
  }, []);

  // Somebody who has spent ten minutes on an achievement and closes the tab
  // should be asked.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Escape closes the editor.
  useEffect(() => {
    if (!section) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section]);

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
      setNextSteps(response.next_steps ?? []);
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
      <div className="relative min-h-dvh">
        <AppBar brandHref="/" context="Profile" width="wide" />
        {error && (
          <div className="gutter-bar mx-auto max-w-wide pt-4">
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          </div>
        )}
      </div>
    );
  }

  const label = section ? PROFILE_SECTIONS.find((item) => item.key === section)?.label : null;

  return (
    <div className="relative min-h-dvh">
      <AppBar brandHref="/" context="Profile" width="wide">
        <BarLink href="/tailor">Tailor a CV</BarLink>
        <BarLink href="/library">Library</BarLink>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className={cn(
            "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 font-display text-xs font-medium transition-colors",
            dirty ? "bg-ink text-paper hover:opacity-90" : "bg-sunken text-slate",
          )}
        >
          {saving ? "Saving…" : dirty ? "Save changes" : saved ? "Saved" : "Saved"}
        </button>
      </AppBar>

      <main className="gutter-bar mx-auto max-w-wide pb-28 pt-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:gap-12">
          {/* ── The sheet ──────────────────────────────────────────────── */}
          <div className="mx-auto w-full max-w-3xl">
            <header className="flex flex-wrap items-end justify-between gap-4 pb-5">
              <div>
                <h1 className="font-display text-2xl font-medium tracking-[-0.022em] text-ink sm:text-3xl">
                  {welcome ? "Let Aptly read your CV" : "Your career, not just your CV"}
                </h1>
                <p className="max-w-xl pt-2 text-sm leading-relaxed text-slate">
                  {welcome
                    ? "Drop a resume and it fills this sheet in — you check it before anything is saved."
                    : "A tailored CV may only say what is on this sheet. Click any part of it to add to it."}
                </p>
              </div>
            </header>

            <ProfileSheet
              profile={profile}
              active={section}
              onPick={(key) => setSection(key === section ? null : key)}
              completeness={completeness}
            />
          </div>

          {/* ── The margin: how much is here, and the quick way to add ────── */}
          <aside className="space-y-4 lg:sticky lg:top-[calc(var(--spacing-bar)+1rem)] lg:self-start">
            <section className="rounded-xl bg-raised p-4 ring-1 ring-hairline">
              <div className="flex items-center gap-4">
                <ScoreRing value={completeness} size={64} label="of what a rebuild needs" instant />
                <div className="min-w-0">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    How much Aptly knows
                  </p>
                  <p className="pt-1 text-xs leading-relaxed text-slate">
                    {completeness >= 80
                      ? "Enough for a strong rebuild."
                      : completeness >= 40
                        ? "Enough to start. More here, better results."
                        : "A rebuild has little to stand on yet."}
                  </p>
                </div>
              </div>
              {nextSteps.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
                  {nextSteps.slice(0, 3).map((step) => (
                    <li key={step} className="flex gap-2 text-2xs leading-relaxed text-ink/80">
                      <span aria-hidden className="mt-[0.4rem] block size-1 shrink-0 rounded-full bg-amber" />
                      {step}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ImportPanel
              startOpen={welcome}
              onImported={(next, newCompleteness) => {
                setProfile(next);
                setCompleteness(newCompleteness);
                setDirty(true);
              }}
            />

            <p className="px-1 text-2xs leading-relaxed text-slate">
              Nothing here is invented. Anything you leave out, a tailored CV cannot use; anything
              you add, it may.
            </p>
          </aside>
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

      {/* ── The editor, beside the sheet ──────────────────────────────────
          A drawer rather than a page: the sheet stays in view and rewrites
          itself as you type, which is the whole reason to draw it. */}
      <AnimatePresence>
        {section && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSection(null)}
              className="fixed inset-0 z-40 bg-paper/50 backdrop-blur-[2px] lg:hidden"
            />
            <motion.aside
              key="editor"
              role="dialog"
              aria-label={`Edit ${label}`}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={SPRING}
              className="fixed inset-y-0 right-0 z-40 flex w-[min(36rem,100vw)] flex-col border-l border-hairline bg-raised/95 shadow-hero backdrop-blur-xl"
            >
              <header className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    Editing
                  </p>
                  <h2 className="truncate font-display text-lg font-medium text-ink">{label}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSection(null)}
                  className="inline-flex h-9 items-center rounded-pill bg-ink px-4 font-display text-xs font-medium text-paper transition-opacity hover:opacity-90"
                >
                  Done
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={section}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={EASE}
                  >
                    <Editor section={section} profile={profile} onChange={update} />
                  </motion.div>
                </AnimatePresence>
              </div>
              {dirty && (
                <footer className="flex items-center gap-3 border-t border-hairline px-5 py-3">
                  <p className="min-w-0 flex-1 truncate text-2xs text-slate">
                    The sheet shows your changes. They are not saved yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="inline-flex h-9 shrink-0 items-center rounded-pill bg-signal px-4 font-display text-xs font-medium text-paper transition-colors hover:bg-signal-hover disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </footer>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* A save bar that only exists when there is something to save and the
          editor is closed. */}
      <AnimatePresence>
        {dirty && !section && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={SPRING}
            className="gutter-bar fixed inset-x-0 bottom-0 z-30 pb-4"
          >
            <div className="mx-auto flex max-w-wide items-center gap-3 rounded-pill border border-hairline bg-raised/90 px-4 py-2.5 shadow-float backdrop-blur-xl">
              <p className="min-w-0 flex-1 truncate text-sm text-slate">Unsaved changes</p>
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
        <CertificationsSection value={profile.certifications} onChange={(v) => set("certifications", v)} />
      );
    case "languages":
      return <LanguagesSection value={profile.languages} onChange={(v) => set("languages", v)} />;
    case "awards":
      return <AwardsSection value={profile.awards} onChange={(v) => set("awards", v)} />;
    case "publications":
      return <PublicationsSection value={profile.publications} onChange={(v) => set("publications", v)} />;
    case "volunteering":
      return <VolunteeringSection value={profile.volunteering} onChange={(v) => set("volunteering", v)} />;
    case "preferences":
      return <PreferencesSection value={profile.preferences} onChange={(v) => set("preferences", v)} />;
    case "notes":
      return <NotesSection value={profile.notes} onChange={(v) => set("notes", v)} />;
  }
}

export default function Page() {
  return (
    <RequireAccount>
      {/* `useSearchParams` needs a boundary; the fallback is the page's own
          ground rather than a spinner — this resolves in a frame. */}
      <Suspense fallback={<div className="min-h-dvh" />}>
        <ProfileScreen />
      </Suspense>
    </RequireAccount>
  );
}
