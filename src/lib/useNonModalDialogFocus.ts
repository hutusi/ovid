import { useEffect, useRef } from "react";

/**
 * Non-trapping focus management for a panel that can hide (the properties panel,
 * inline or as the compact drawer). Unlike `useFocusTrap` it does not contain
 * Tab — the background stays interactive.
 *
 * - `visible` — whether the panel is currently shown. When it becomes visible
 *   and `autoFocus` is true (the drawer, a non-modal dialog), focus moves onto
 *   `dialogRef` so the dialog is announced. Inline the panel shouldn't grab
 *   focus, so pass `autoFocus={false}` there.
 * - When the panel hides, focus is returned to `triggerRef` *only if* it was
 *   stranded on `<body>` — i.e. the focused control (collapse button, drawer
 *   content) was inside the panel that just hid. If focus already moved
 *   elsewhere (the user clicked into the editor), it's left alone.
 *
 * Attach `dialogRef` to the panel's focusable root (give it `tabindex={-1}` when
 * it's the drawer) and `triggerRef` to the control focus should return to. Both
 * refs are optional at call time; an unset ref just no-ops.
 */
export function useNonModalDialogFocus<
  D extends HTMLElement = HTMLDivElement,
  Tr extends HTMLElement = HTMLButtonElement,
>(visible: boolean, autoFocus: boolean) {
  const dialogRef = useRef<D>(null);
  const triggerRef = useRef<Tr>(null);
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      if (autoFocus) dialogRef.current?.focus();
    } else if (!visible && wasVisible.current) {
      // Reclaim focus only if it was stranded by the hide: either it fell to
      // <body> (some browsers blur the focused descendant) or it's still on a
      // now-hidden descendant of the panel (others don't blur). If it moved
      // elsewhere — the user clicked into the editor — leave it alone.
      const active = document.activeElement;
      const insidePanel = active != null && dialogRef.current?.contains(active) === true;
      if (!active || active === document.body || insidePanel) {
        triggerRef.current?.focus();
      }
    }
    wasVisible.current = visible;
  }, [visible, autoFocus]);

  return { dialogRef, triggerRef };
}
