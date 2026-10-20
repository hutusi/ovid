import { clampSidebarWidth } from "./sidebarUtils";

/** The user's preferred sidebar width, shared by the sidebar and the search
 *  panel that takes its place, so switching between them doesn't jump. */
export const SIDEBAR_WIDTH_KEY = "ovid:sidebarWidth";
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 240;

export function readStoredSidebarWidth(): number {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  } catch {
    // Storage unavailable: fall back to the default.
  }
  const parsed = stored ? Number(stored) : SIDEBAR_DEFAULT;
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT;
  return clampSidebarWidth(parsed, SIDEBAR_MIN, SIDEBAR_MAX);
}
