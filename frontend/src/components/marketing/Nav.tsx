"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#trust", label: "Trust" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/**
 * A floating pill nav.
 *
 * Detached from the top edge so the scene behind it stays visible and the page
 * reads as layered rather than as a document with a toolbar. It gains a firmer
 * shadow once you scroll, which is the only cue needed that it is pinned.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none sticky top-0 z-40 px-4 pt-4">
      <nav
        className={cn(
          "pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 rounded-pill bg-raised/85 px-2 py-2 backdrop-blur-xl transition-shadow duration-300 ultra:max-w-4xl",
          scrolled
            ? "shadow-float ring-1 ring-ink/5"
            : "shadow-raised ring-1 ring-ink/[0.04]",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-pill pl-2.5 pr-1 font-display text-sm font-semibold tracking-tight text-ink"
        >
          <Mark />
          Aptly
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-1 sm:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-pill px-2.5 py-1.5 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
          {/* Hidden on the narrowest phones: the nav is already carrying a
              wordmark and two actions, and a third control there pushes the
              primary one off the row. Dark mode still follows the device
              there — the toggle only overrides it. */}
          <ThemeToggle className="mr-1 hidden xs:inline-flex" />
          <Link
            href="/library"
            className="rounded-pill px-2.5 py-1.5 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
          >
            Library
          </Link>
          <Link
            href="/tailor"
            className="inline-flex h-8 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft"
          >
            Tailor a CV
          </Link>
        </div>
      </nav>
    </div>
  );
}

/** A folded sheet — the product's one object, at 16px. */
function Mark() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4">
      <path
        d="M4 2.5h7.5L16 7v10.5H4z"
        fill="#fbfbfa"
        stroke="#16181d"
        strokeWidth="1.4"
      />
      <path d="M11.5 2.5V7H16" fill="none" stroke="#16181d" strokeWidth="1.4" />
      <path
        d="M6.5 11h7M6.5 13.5h4.5"
        stroke="#14655c"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
