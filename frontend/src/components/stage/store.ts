"use client";

import { useEffect } from "react";

import { POSES, type Pose, type PoseName, mix } from "./poses";

/**
 * What the room is currently being asked to show.
 *
 * Held outside React on purpose. The stage reads it sixty times a second from
 * inside a frame loop; routing it through component state would re-render the
 * whole canvas tree on every scroll tick and every pose change, which is the
 * one thing a persistent 3D layer must not do.
 *
 * Screens *write* to it — "I am the drop screen", "the score has landed", "the
 * scroll is 40% through the story" — and the stage interpolates toward
 * whatever it was last told.
 */

interface StageRequest {
  /** The pose being asked for. */
  pose: PoseName;
  /**
   * A second pose to blend toward, with how far between them.
   *
   * The landing page is one continuous move rather than a series of jumps, so
   * it asks for "between `landing.read` and `landing.edit`, 30% of the way"
   * instead of flipping between named stops.
   */
  blend?: { to: PoseName; t: number };
  /** Beam on, for the screen that is reading a CV. */
  scanning: boolean;
  /** How full the paper looks, 0–1. The drop screen fills it as you paste. */
  fill: number;
  /** A one-off pulse of light, for the moment a score lands. */
  flash: number;
}

const current: StageRequest = {
  pose: "idle",
  scanning: false,
  fill: 1,
  flash: 0,
};

/** Read the live request. Called from the frame loop, never from render. */
export function stageRequest(): Readonly<StageRequest> {
  return current;
}

/** The pose asked for, already blended. */
export function resolvedPose(): Pose {
  const from = POSES[current.pose];
  if (!current.blend) return from;
  const to = POSES[current.blend.to];
  return mix(from, to, Math.min(1, Math.max(0, current.blend.t)));
}

export function setPose(pose: PoseName, blend?: StageRequest["blend"]): void {
  current.pose = pose;
  current.blend = blend;
}

export function setScanning(on: boolean): void {
  current.scanning = on;
}

export function setFill(value: number): void {
  current.fill = Math.min(1, Math.max(0, value));
}

/** Ask for a burst of light. Decays on its own inside the loop. */
export function flash(): void {
  current.flash = 1;
}

/** Called by the stage as it consumes the flash. */
export function decayFlash(amount: number): void {
  current.flash = Math.max(0, current.flash - amount);
}

/**
 * Declare which pose a screen wants, for as long as it is mounted.
 *
 * Takes the pose and, optionally, the live extras. A screen that only has one
 * look calls this once and forgets about the room.
 */
export function useStage(
  pose: PoseName,
  options: { scanning?: boolean; fill?: number } = {},
): void {
  const { scanning, fill } = options;

  useEffect(() => {
    setPose(pose);
  }, [pose]);

  useEffect(() => {
    if (scanning === undefined) return;
    setScanning(scanning);
    return () => setScanning(false);
  }, [scanning]);

  useEffect(() => {
    if (fill === undefined) return;
    setFill(fill);
  }, [fill]);
}
