import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { useNonModalDialogFocus } from "./useNonModalDialogFocus";

describe("useNonModalDialogFocus", () => {
  let dialog: HTMLDivElement;
  let trigger: HTMLButtonElement;

  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  afterEach(() => {
    dialog?.remove();
    trigger?.remove();
  });

  function setup() {
    dialog = document.createElement("div");
    dialog.tabIndex = -1;
    document.body.appendChild(dialog);
    trigger = document.createElement("button");
    document.body.appendChild(trigger);

    const rendered = renderHook(({ open }) => useNonModalDialogFocus(open), {
      initialProps: { open: false },
    });
    rendered.result.current.dialogRef.current = dialog;
    rendered.result.current.triggerRef.current = trigger;
    return rendered;
  }

  it("focuses the dialog root on open and returns focus to the trigger on close", () => {
    const { rerender } = setup();

    act(() => rerender({ open: true }));
    expect(document.activeElement).toBe(dialog);

    act(() => rerender({ open: false }));
    expect(document.activeElement).toBe(trigger);
  });

  it("does not move focus when the trigger is absent on close", () => {
    const { result, rerender } = setup();

    act(() => rerender({ open: true }));
    expect(document.activeElement).toBe(dialog);

    // Simulate the trigger not being rendered (e.g. the panel became inline
    // rather than being dismissed): focus must be left untouched, not thrown.
    result.current.triggerRef.current = null;
    act(() => rerender({ open: false }));
    expect(document.activeElement).toBe(dialog);
  });
});
