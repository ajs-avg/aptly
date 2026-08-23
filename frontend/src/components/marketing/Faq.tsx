"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens } from "@/lib/utils";

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

/**
 * The FAQ.
 *
 * Two columns, because eight questions stacked is a scroll rather than a glance.
 * Two of the answers say the product cannot do something — a page of unbroken
 * reassurance is exactly what makes a reader distrust the rest of it.
 */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const columns = [QUESTIONS.slice(0, 4), QUESTIONS.slice(4)];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="space-y-3">
          {column.map((item, itemIndex) => {
            const index = columnIndex * 4 + itemIndex;
            const isOpen = open === index;

            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-xl bg-raised shadow-raised ring-1 ring-ink/5"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    aria-hidden
                    className="relative mt-1 h-3.5 w-3.5 shrink-0 text-signal"
                  >
                    <span className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 rounded-pill bg-current" />
                    <motion.span
                      className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 rounded-pill bg-current"
                      animate={{ scaleY: isOpen ? 0 : 1 }}
                      transition={{
                        duration: motionTokens.quick,
                        ease: motionTokens.easeOut,
                      }}
                    />
                  </span>
                  <span className="font-display text-sm font-medium leading-snug text-ink">
                    {item.q}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: motionTokens.base,
                        ease: motionTokens.easeOut,
                      }}
                    >
                      <p className="px-4 pb-4 pl-[1.9rem] text-sm leading-relaxed text-slate">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
