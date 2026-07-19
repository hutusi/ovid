import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Returns a ref to attach to a dialog/modal container.
 * When `active` (default true):
 *   On activate: saves the previously focused element and focuses the first
 *                focusable child (unless the container already contains focus).
 *   On Tab: cycles focus within the container.
 *   On deactivate: restores focus to the element focused before it opened.
 * When `active` is false the ref is inert (no focus move, no Tab trap) — for a
 * container that is only sometimes an overlay, e.g. a panel that becomes a
 * drawer at narrow widths.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    // Capture as a non-optional local so closures below don't need `!` assertions.
    const container: T = ref.current as T;
    if (!active || !container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
      first?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return ref;
}
