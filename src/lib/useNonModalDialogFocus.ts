import { useEffect, useRef } from "react";

/**
 * Non-trapping focus management for a non-modal dialog (e.g. the compact
 * properties drawer). Unlike `useFocusTrap` it does not contain Tab — the
 * background stays interactive — it only moves focus *into* the dialog on open
 * and *returns* it to a trigger on close, so the dialog is announced and
 * keyboard focus is never stranded on `<body>` when the trigger unmounts.
 *
 * Attach `dialogRef` to the dialog's focusable root (give it `tabindex={-1}`)
 * and `triggerRef` to the control focus should return to when it closes. Both
 * are optional at call time: if a ref is unset (e.g. the trigger isn't rendered
 * because the panel became inline rather than being dismissed) focus is left
 * untouched.
 */
export function useNonModalDialogFocus<
  D extends HTMLElement = HTMLDivElement,
  Tr extends HTMLElement = HTMLButtonElement,
>(open: boolean) {
  const dialogRef = useRef<D>(null);
  const triggerRef = useRef<Tr>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      dialogRef.current?.focus();
    } else if (!open && wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return { dialogRef, triggerRef };
}
