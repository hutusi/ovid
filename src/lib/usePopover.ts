import { type RefObject, useEffect } from "react";
import { useStableCallback } from "./useStableCallback";

const FOCUSABLE_SELECTORS = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface UsePopoverOptions {
  open: boolean;
  onClose: () => void;
  /** Wraps the trigger and the popover. A press outside it, or focus moving
   *  out of it, closes the popover; keys pressed inside reach it first. */
  containerRef: RefObject<HTMLElement | null>;
  /** The popover itself. Focus moves to its first control on open. */
  panelRef: RefObject<HTMLElement | null>;
  /** Focus this instead of the panel's first control on open. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** A role="menu" popover: Arrow keys, Home and End move between its
   *  role="menuitem" children. */
  menu?: boolean;
  /** Close when focus moves outside the container (Tab past the end).
   *  Default true. */
  closeOnFocusOut?: boolean;
}

/**
 * The shared behaviour of the app's non-modal popovers (a positioned <div>,
 * no portal; see CLAUDE.md "Custom popovers"): focus moves in when it opens;
 * Escape closes it and returns focus to where it was; a press outside, or
 * Tab past its last control, closes it and leaves focus there.
 *
 * Escape is handled on the container, before the event bubbles to React's
 * root or the document, so closing a popover does not also close the dialog
 * it sits in, leave zen mode, or reach the editor.
 */
export function usePopover({
  open,
  onClose,
  containerRef,
  panelRef,
  initialFocusRef,
  menu = false,
  closeOnFocusOut = true,
}: UsePopoverOptions) {
  const close = useStableCallback(onClose);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    // Usually the editor or the trigger: WebKit does not focus a clicked
    // button, so a mouse user's focus is still wherever they were typing.
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first =
      initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
    first?.focus();

    function menuItems(): HTMLElement[] {
      return Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        if (returnTo?.isConnected) returnTo.focus();
        return;
      }
      if (!menu) return;
      const items = menuItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;
      if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
      else if (e.key === "ArrowUp")
        next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      if (next === null) return;
      // Keep list navigation around the menu (a listbox it sits in) still.
      e.preventDefault();
      e.stopPropagation();
      items[next]?.focus();
    }

    function handlePointerDown(e: PointerEvent) {
      if (!container?.contains(e.target as Node)) close();
    }

    function handleFocusOut(e: FocusEvent) {
      // relatedTarget is null when focus goes nowhere in particular (a click
      // on a non-focusable spot, the window losing focus): not a reason to
      // close. A press outside is handled by pointerdown.
      const next = e.relatedTarget;
      if (next instanceof Node && !container?.contains(next)) close();
    }

    container.addEventListener("keydown", handleKeyDown);
    if (closeOnFocusOut) container.addEventListener("focusout", handleFocusOut);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, close, containerRef, panelRef, initialFocusRef, menu, closeOnFocusOut]);
}
