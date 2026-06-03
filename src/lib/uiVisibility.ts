import type React from "react";

export const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";
export const PROPERTIES_OPEN_KEY = "ovid:propertiesOpen";

/**
 * Toggles a boolean state and persists the new value to localStorage.
 * Shared between the keyboard, native-menu, and in-app button toggle
 * paths so the three stay in lockstep — a missed call site silently
 * drifts the persisted value from the runtime state.
 */
export function togglePersisted(
  setter: React.Dispatch<React.SetStateAction<boolean>>,
  key: string
): void {
  setter((prev) => {
    const next = !prev;
    localStorage.setItem(key, String(next));
    return next;
  });
}
