"use client";

import { useEffect } from "react";

import { setPose } from "@/components/stage/store";

/**
 * The room, as the landing page scrolls.
 *
 * Two places only: the sheet beside the headline while the hero is on
 * screen, and both sheets retreated into the fog once it is not — the rest
 * of the page is drawings of the product, and those want a quiet ground.
 * The stage glides between the two, so a scroll back up is the sheet
 * returning rather than appearing.
 */
export function LandingStage() {
  useEffect(() => {
    let last: "landing.hero" | "landing.scroll" | null = null;
    const update = () => {
      const next = window.scrollY > 380 ? "landing.scroll" : "landing.hero";
      if (next !== last) {
        last = next;
        setPose(next);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return null;
}
