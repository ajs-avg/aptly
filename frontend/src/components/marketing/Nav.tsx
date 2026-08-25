"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { EASE_QUICK, SPRING } from "@/components/motion/primitives";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
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
 *
 * ── What it holds, and when ───────────────────────────────────────────────
 *
 * A pill cannot wrap. Wrapping is what a pill is not, so every control in it
 * competes for one row of finite width, and the row is 390px on the most common
 * device there is. The earlier version put nine things in that row and hid two
 * of them below 384px, which left a phone carrying a wordmark, a three-way
 * theme switch, two text links and a solid button — around 340px of content
 * before gaps, in 350px of usable space. It overflowed, and on a touch screen
 * it overflowed harder, because the coarse-pointer rule grew each of the theme
 * switch's three buttons to 44px and took the pill with it.
 *
 * So the row now holds only what earns its place at that width: the wordmark,
 * the one action the page is asking for, and a way to reach everything else.
 * Controls join the row as the window widens enough to seat them — the theme
 * switch at `md`, the section links and account actions at `lg` — and the menu
 * button retires at the same moment the last of them arrives, because a menu
 * duplicating a row that is fully visible is a second way to do one thing.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /*
   * Three ways out of the menu, because there are three ways people leave one:
   * they pick something, they press Escape, or they tap the page behind it. A
   * menu that only closes on the first is the one that gets stuck open.
   *
   * The fourth is the window growing past `lg`, where the menu's contents are
   * all on the bar anyway — leaving it open there would float a panel of
   * duplicates under a row that already shows them.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) setOpen(false);
    };
    const wide = window.matchMedia("(width >= 64rem)");
    const onWide = () => wide.matches && setOpen(false);

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <div
      ref={shell}
      className="gutter-bar pointer-events-none sticky top-0 z-40 pt-3 sm:pt-4"
    >
      <nav
        className={cn(
          "pointer-events-auto mx-auto flex h-14 max-w-3xl items-center gap-1 rounded-pill bg-raised/85 px-2 backdrop-blur-xl transition-shadow duration-300 ultra:max-w-4xl",
          scrolled
            ? "shadow-float ring-1 ring-ink/5"
            : "shadow-raised ring-1 ring-ink/[0.04]",
        )}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-pill px-2.5 py-2 font-display text-sm font-semibold tracking-tight text-ink"
        >
          <Mark />
          Aptly
        </Link>

        {/* The section links, once there is room to seat all four without
            crowding the wordmark. `flex-1` centres them in whatever is left
            over rather than in the bar — which is the honest centre here, since
            the two ends carry different weights and always will. */}
        <div className="hidden flex-1 items-center justify-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-pill px-2.5 py-2 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <ThemeToggle className="mr-0.5 hidden md:inline-flex" />

          <Link
            href="/library"
            className="hidden rounded-pill px-2.5 py-2 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink lg:inline-flex"
          >
            Library
          </Link>
          <Link
            href="/sign-in"
            className="hidden rounded-pill px-2.5 py-2 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink lg:inline-flex"
          >
            Sign in
          </Link>

          <Link
            href="/tailor"
            className="inline-flex h-9 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft"
          >
            Tailor a CV
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            // Square as it grows for the thumb, so the two rules stay centred in
            // a circle rather than in a lozenge.
            className="grid size-9 shrink-0 place-items-center rounded-pill text-slate transition-colors hover:bg-sunken hover:text-ink lg:hidden [@media(pointer:coarse)]:w-11"
          >
            <MenuMark open={open} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={EASE_QUICK}
            className="pointer-events-auto mx-auto mt-2 max-w-3xl overflow-hidden rounded-3xl bg-raised/95 p-2 shadow-float ring-1 ring-ink/5 backdrop-blur-xl lg:hidden"
          >
            <div className="grid gap-0.5">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center rounded-2xl px-3.5 py-3 font-display text-sm text-ink transition-colors hover:bg-sunken"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2 border-t border-hairline pt-2">
              <Link
                href="/library"
                onClick={() => setOpen(false)}
                className="flex flex-1 items-center justify-center rounded-2xl px-3 py-3 font-display text-sm text-slate transition-colors hover:bg-sunken hover:text-ink"
              >
                Library
              </Link>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="flex flex-1 items-center justify-center rounded-2xl px-3 py-3 font-display text-sm text-slate transition-colors hover:bg-sunken hover:text-ink"
              >
                Sign in
              </Link>
              {/* The one control that belongs in here on a phone and on the bar
                  from `md` up. It is a preference, not a destination, so it
                  keeps its own shape rather than becoming a third row item. */}
              <ThemeToggle className="shrink-0 md:hidden" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

/**
 * Two rules that become a cross.
 *
 * One shape rather than two icons swapped on a boolean: swapping makes the
 * control blink at the moment it is pressed, which reads as the button failing
 * rather than as the menu opening. The rules simply rotate to where they were
 * already going.
 */
function MenuMark({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="relative block h-3.5 w-4">
      <motion.span
        className="absolute left-0 h-[1.5px] w-full rounded-pill bg-current"
        animate={open ? { top: "50%", rotate: 45 } : { top: "15%", rotate: 0 }}
        transition={SPRING}
      />
      <motion.span
        className="absolute left-0 h-[1.5px] w-full rounded-pill bg-current"
        animate={open ? { top: "50%", rotate: -45 } : { top: "75%", rotate: 0 }}
        transition={SPRING}
      />
    </span>
  );
}
