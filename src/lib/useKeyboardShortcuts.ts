import { useEffect } from "react";
import {
  type AppActionCtx,
  dispatchAppAction,
  eventMatchesShortcut,
  getAppAction,
} from "./appActions";
import { shortcuts } from "./shortcuts";

// The keyboard adapter for the global action table (ADR 0018): one
// capture-phase keydown listener that joins `"global"`-source entries from
// shortcuts.ts to table rows by id. Keys live in shortcuts.ts (the help
// dialog renders from it); behavior and guards live in appActions.ts.
//
// Two bindings stay bespoke because their matching isn't modifier-exact:
// - Escape exits zen mode (no entry in shortcuts.ts — contextual).
// - `?` opens the shortcuts help: matched on the *produced* character so
//   layouts where `?` is unshifted also work.
const GLOBAL_KEY_ENTRIES = shortcuts.filter(
  (s) => s.source === "global" && s.id !== "show-shortcuts"
);

function isInInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Wire global keyboard shortcuts to the app action table. */
export function useKeyboardShortcuts(ctx: AppActionCtx): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Escape exits zen mode (only when no modal is blocking).
      if (e.key?.toLowerCase() === "escape" && ctx.zenMode && !ctx.overlay.isBlocking) {
        ctx.setZenMode(false);
        return;
      }
      // `?` opens the keyboard shortcuts help dialog. The `?` character
      // requires Shift on most layouts; we match on the produced key, not
      // the underlying physical key, so layouts where `?` is unshifted
      // also work. Suppressed when an input has focus or any blocking
      // overlay is open.
      if (e.key === "?" && !ctx.overlay.isBlocking && !isInInput(e.target)) {
        e.preventDefault();
        ctx.overlay.open({ kind: "shortcutsHelp" });
        return;
      }

      const inInput = isInInput(e.target);
      for (const entry of GLOBAL_KEY_ENTRIES) {
        if (!eventMatchesShortcut(entry.keys, e)) continue;
        const action = getAppAction(entry.id);
        if (!action) continue;
        // preventDefault only when the action actually fires — a suppressed
        // shortcut (input focus, blocking overlay) must not swallow the key
        // from the editor or a native menu accelerator.
        if (dispatchAppAction(action, ctx, { inInput })) e.preventDefault();
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [ctx]);
}
