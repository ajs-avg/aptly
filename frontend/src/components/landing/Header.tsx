"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

const LINKS = [
  { href: "#story", label: "Product", id: "story" },
  { href: "#trust", label: "Trust", id: "trust" },
  { href: "#pricing", label: "Pricing", id: "pricing" },
  { href: "#faq", label: "FAQ", id: "faq" },
];

const SIGN_IN = "/sign-in?next=%2Ftailor";

/**
 * Three frosted pills: the mark, the links, the account. Fixed, so they ride
 * over every section; glass, so the page shows through them.
 *
 * The highlighted link follows the section in view rather than the last one
 * pressed — a reader who scrolls never presses anything.
 *
 * Under 720px the links and the account retire behind a burger, and the menu
 * is a white sheet under the header: overlay click, Escape, a link, or
 * widening the window all close it.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const menuId = useId();

  useEffect(() => {
    const targets = LINKS.map((link) => document.getElementById(link.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (targets.length === 0) return;

    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.intersectionRatio);
        let best: string | null = null;
        let ratio = 0;
        for (const [id, r] of seen) {
          if (r > ratio) {
            ratio = r;
            best = id;
          }
        }
        setActive(ratio > 0 ? best : null);
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 720) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="Aptly home">
        <span className={cn(styles.logoMark, styles.display)} aria-hidden>
          <span>A</span>
        </span>
        <span className={cn(styles.logoWord, styles.display)}>Aptly</span>
      </Link>

      <nav className={styles.navPill} aria-label="Primary">
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            className={cn(styles.navLink, active === link.id && styles.navLinkActive)}
            aria-current={active === link.id ? "true" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <AccountPill />

      <button
        type="button"
        className={cn(styles.burger, open && styles.burgerOpen)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={() => setOpen(false)} />
          <div id={menuId} className={styles.sheet} role="dialog" aria-label="Menu">
            {LINKS.map((link, index) => (
              <a
                key={link.id}
                href={link.href}
                className={cn(styles.sheetLink, active === link.id && styles.sheetLinkActive)}
                style={{ "--d": `${0.06 + index * 0.05}s` } as React.CSSProperties}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <SheetAccount delay={0.06 + LINKS.length * 0.05} onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
    </header>
  );
}

/* Signed out it is "Sign in". Signed in it is the way to the Library, with
   the person's initial — the one thing worth taking from a landing page when
   you already have an account. Unknown holds the space and says nothing. */
function AccountPill() {
  const account = useAccount();

  if (account.status === "unknown") {
    return <span aria-hidden className={styles.signInSpacer} />;
  }

  if (account.status === "out") {
    return (
      <Link href={SIGN_IN} className={styles.signIn}>
        Sign in
      </Link>
    );
  }

  const initial = (account.name ?? account.email ?? "?").charAt(0).toUpperCase();
  return (
    <Link href="/library" className={styles.signIn} aria-label="Your Library">
      <span className={cn(styles.avatar, styles.display)} aria-hidden>
        {initial}
      </span>
      Library
    </Link>
  );
}

function SheetAccount({ delay, onNavigate }: { delay: number; onNavigate: () => void }) {
  const account = useAccount();
  const signedIn = account.status === "in";
  return (
    <Link
      href={signedIn ? "/library" : SIGN_IN}
      className={styles.sheetSignIn}
      style={{ "--d": `${delay}s` } as React.CSSProperties}
      onClick={onNavigate}
    >
      {signedIn ? "Your Library" : "Sign in"}
    </Link>
  );
}
