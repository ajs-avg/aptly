"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { DropBox } from "./DropBox";
import { EASE } from "@/components/motion/primitives";
import { getProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Which CV to tailor: the one Aptly already knows, or a new one.
 *
 * The profile holds a whole career; a resume holds what fitted on two pages.
 * Somebody who keeps the profile current therefore has the better starting
 * document — and, more to the point, does not have to go and find a file to
 * begin. That is the thing that makes keeping it current worth doing, and it
 * only works if it is offered here, at the moment the file would otherwise be
 * asked for.
 *
 * The choice appears only when there is a profile worth choosing. Offering
 * "use what Aptly knows" to somebody who has told it nothing is an option that
 * produces a worse CV than the alternative and no way to tell in advance.
 */
export function CvSource({
  cvText,
  cvFile,
  useProfile,
  onUseProfile,
  onCvText,
  onCvFile,
  onClearFile,
}: {
  cvText: string;
  cvFile: File | null;
  useProfile: boolean;
  onUseProfile: (value: boolean) => void;
  onCvText: (value: string) => void;
  onCvFile: (file: File) => void;
  onClearFile: () => void;
}) {
  const [profile, setProfile] = useState<{
    completeness: number;
    roles: number;
    name: string;
  } | null>(null);

  useEffect(() => {
    void getProfile()
      .then((response) =>
        setProfile({
          completeness: response.completeness,
          roles: response.profile.roles.length,
          name: response.profile.identity.full_name,
        }),
      )
      // A profile that will not load is not worth a message here. The file
      // path below works regardless, and this screen's job is to start a run.
      .catch(() => setProfile(null));
  }, []);

  const hasProfile = Boolean(profile && profile.roles > 0);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {hasProfile && profile && (
        <div className="grid gap-2 sm:grid-cols-2">
          <SourceCard
            active={useProfile}
            onClick={() => onUseProfile(true)}
            title="What Aptly knows"
            detail={`${profile.roles} ${profile.roles === 1 ? "role" : "roles"} · ${profile.completeness}% complete`}
          />
          <SourceCard
            active={!useProfile}
            onClick={() => onUseProfile(false)}
            title="A different CV"
            detail="Paste it, or drop a file"
          />
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {useProfile && hasProfile && profile ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={EASE}
            className="flex min-h-[min(15rem,42dvh)] flex-col justify-center rounded-lg bg-raised p-5 shadow-lifted ring-1 ring-hairline"
          >
            <p className="font-display text-2xs font-medium uppercase tracking-[0.07em] text-ink">
              Your CV
            </p>
            <p className="pt-3 font-display text-lg font-semibold text-ink">
              {profile.name || "Your profile"}
            </p>
            <p className="pt-1.5 text-sm leading-relaxed text-slate">
              Built from your profile — every role, project and skill you have
              recorded, not only what fitted on one page.
            </p>
            <div className="pt-4">
              <Link
                href="/profile"
                className="inline-flex h-9 items-center rounded-pill px-3.5 font-display text-xs text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
              >
                Add something first
              </Link>
            </div>
            {/* The one thing this path cannot do, said before it matters rather
                than discovered at the download. In-place editing needs a file
                to edit; there is no file here. */}
            <p className="pt-4 text-2xs leading-relaxed text-slate">
              This builds a new document rather than editing one of yours, so
              there is no original formatting to keep. Drop a file instead if
              you need your own layout back.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={EASE}
            className="flex min-w-0 flex-1 flex-col"
          >
            <DropBox
              label="Your CV"
              hint=".docx · .pdf · .tex · .txt"
              placeholder="Paste your CV, or drop a file anywhere in this box."
              accept=".docx,.pdf,.tex,.txt,.md"
              value={cvText}
              onTextChange={onCvText}
              onFile={onCvFile}
              file={cvFile}
              onClearFile={onClearFile}
              emphasis
              footer={
                <p className="text-2xs leading-relaxed text-slate">
                  Word and LaTeX files are edited in place, so your formatting is
                  kept exactly.
                </p>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourceCard({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg px-3.5 py-3 text-left ring-1 transition-colors",
        active ? "bg-signal-soft ring-signal" : "bg-raised ring-hairline hover:bg-sunken",
      )}
    >
      <span
        className={cn(
          "block font-display text-sm font-medium",
          active ? "text-signal" : "text-ink",
        )}
      >
        {title}
      </span>
      <span className="block pt-0.5 text-2xs text-slate">{detail}</span>
    </button>
  );
}
