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

  function setup(autoFocus = true) {
    dialog = document.createElement("div");
    dialog.tabIndex = -1;
    document.body.appendChild(dialog);
    trigger = document.createElement("button");
    document.body.appendChild(trigger);

    const rendered = renderHook(
      ({ visible, autoFocus }) => useNonModalDialogFocus(visible, autoFocus),
      { initialProps: { visible: false, autoFocus } }
    );
    rendered.result.current.dialogRef.current = dialog;
    rendered.result.current.triggerRef.current = trigger;
    return rendered;
  }

  it("focuses the dialog on open (autoFocus) and returns focus to the trigger when it hides", () => {
    // A focused *descendant* that stays focused through the hide — browsers don't
    // reliably blur it — must still be reclaimed. (No blur() masking the case.)
    const { rerender } = setup(true);
    const child = document.createElement("button");
    dialog.appendChild(child);

    act(() => rerender({ visible: true, autoFocus: true }));
    expect(document.activeElement).toBe(dialog);

    act(() => child.focus());
    act(() => rerender({ visible: false, autoFocus: true }));
    expect(document.activeElement).toBe(trigger);

    child.remove();
  });

  it("also returns focus when the browser blurred to <body>", () => {
    const { rerender } = setup(true);

    act(() => rerender({ visible: true, autoFocus: true }));
    act(() => dialog.blur());
    act(() => rerender({ visible: false, autoFocus: true }));
    expect(document.activeElement).toBe(trigger);
  });

  it("does not grab focus on open when autoFocus is false, but returns stranded focus on hide", () => {
    const { rerender } = setup(false);

    act(() => rerender({ visible: true, autoFocus: false }));
    expect(document.activeElement).not.toBe(dialog);

    // The inline collapse button (a panel descendant) is focused, then collapsed.
    act(() => dialog.focus());
    act(() => rerender({ visible: false, autoFocus: false }));
    expect(document.activeElement).toBe(trigger);
  });

  it("leaves focus alone when it moved elsewhere before hiding", () => {
    const { rerender } = setup(true);
    const other = document.createElement("button");
    document.body.appendChild(other);

    act(() => rerender({ visible: true, autoFocus: true }));
    act(() => other.focus());
    act(() => rerender({ visible: false, autoFocus: true }));
    expect(document.activeElement).toBe(other);

    other.remove();
  });

  it("does not throw when the trigger is absent on close", () => {
    const { result, rerender } = setup(true);

    act(() => rerender({ visible: true, autoFocus: true }));
    // Trigger not rendered (e.g. panel became inline rather than dismissed).
    result.current.triggerRef.current = null;
    act(() => rerender({ visible: false, autoFocus: true }));
    expect(document.activeElement).toBe(dialog);
  });
});
