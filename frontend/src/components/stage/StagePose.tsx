"use client";

import { useStage } from "./store";
import type { PoseName } from "./poses";

/**
 * Declare the room's pose from a server-rendered page.
 *
 * The landing page is plain server markup — it ranks, and it reads with
 * JavaScript off — so it cannot call the hook itself. This is the one client
 * component it mounts, and all it does is say where the camera should stand.
 */
export function StagePose({ name }: { name: PoseName }) {
  useStage(name);
  return null;
}
