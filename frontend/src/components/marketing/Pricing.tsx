"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { Check } from "./primitives";
import { cn, motionTokens } from "@/lib/utils";

type Plan = "free" | "pro" | "week";

const PLANS: Record<
  Plan,
  {
    label: string;
    price: string;
    unit: string;
    note: string;
    features: string[];
    cta: string;
  }
> = {
  free: {
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
  },
  pro: {
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
  },
  week: {
    label: "Week pass",
    price: "$5",
    unit: "/ 7 days",
    note: "For one application that matters this week.",
    features: [
      "Everything in Pro",
      "Seven days, no subscription",
      "Your records stay after it ends",
    ],
    cta: "Start tailoring",
  },
};

/**
 * Pricing.
 *
 * The numbers are the design doc's, and they are deliberately below the
 * keyword scanners at ~$50 and the autofill tools at ~$40 while covering more
 * of the journey than either.
 *
 * Payments are not built yet, so every button goes to the product rather than
 * to a checkout that does not exist. Saying so on the page is the only honest
 * option — a "Subscribe" button that silently does nothing is worse than no
 * button.
 */
export function Pricing() {
  const [plan, setPlan] = useState<Plan>("pro");
  const active = PLANS[plan];

  return (
    <div className="relative mx-auto max-w-md">
      <div className="rounded-3xl bg-raised p-6 shadow-hero ring-1 ring-ink/5 sm:p-7">
        <div className="flex rounded-pill bg-sunken p-1">
          {(Object.keys(PLANS) as Plan[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPlan(key)}
              className={cn(
                "flex-1 rounded-pill px-3 py-1.5 font-display text-xs transition-colors",
                plan === key
                  ? "bg-ink text-paper"
                  : "text-slate hover:text-ink",
              )}
            >
              {PLANS[key].label}
            </button>
          ))}
        </div>

        <motion.div
          key={plan}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: motionTokens.base,
            ease: motionTokens.easeOut,
          }}
          className="pt-7"
        >
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display text-5xl font-semibold tracking-[-0.04em] text-ink"
              data-numeric
            >
              {active.price}
            </span>
            {active.unit && (
              <span className="font-display text-sm text-slate">
                {active.unit}
              </span>
            )}
          </div>
          <p className="pt-2 text-sm text-slate">{active.note}</p>

          <ul className="space-y-2.5 pt-6">
            {active.features.map((feature) => (
              <Check key={feature}>{feature}</Check>
            ))}
          </ul>

          <Link
            href="/tailor"
            className="mt-7 flex h-12 items-center justify-center rounded-pill bg-signal font-display text-base font-medium text-paper transition-colors hover:bg-signal-hover"
          >
            {active.cta}
          </Link>

          <p className="pt-3 text-center text-2xs leading-relaxed text-slate">
            Paid plans are not live yet — tailoring is free while they are being
            built. No card, no waitlist.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
