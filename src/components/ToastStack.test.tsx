import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, render } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { Toast } from "../lib/useToast";

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: localT, i18n: { language: "en" } }),
}));

const { ToastStack } = await import("./ToastStack");

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

const handlers = () => ({
  onDismiss: mock((_: number) => {}),
  onPause: mock(() => {}),
  onResume: mock(() => {}),
});

describe("ToastStack", () => {
  it("keeps its live region mounted even with nothing to show", () => {
    const view = render(<ToastStack toasts={[]} {...handlers()} />);
    expect(view.container.querySelector('.toast-container[aria-live="polite"]')).not.toBeNull();
    act(() => view.unmount());
  });

  it("announces errors as alerts and offers dismiss; info is a quiet status", () => {
    const toasts: Toast[] = [
      { id: 1, message: "Saved", kind: "info" },
      { id: 2, message: "Save failed", kind: "error" },
    ];
    const h = handlers();
    const view = render(<ToastStack toasts={toasts} {...h} />);
    expect(view.getByRole("status").textContent).toContain("Saved");
    const alert = view.getByRole("alert");
    expect(alert.textContent).toContain("Save failed");
    // Only the error is dismissible.
    const dismiss = view.getAllByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveLength(1);
    act(() => dismiss[0]?.click());
    expect(h.onDismiss).toHaveBeenCalledWith(2);
    act(() => view.unmount());
  });

  it("runs a toast's action and then dismisses it", () => {
    const run = mock(() => {});
    const h = handlers();
    const view = render(
      <ToastStack
        toasts={[{ id: 7, message: "Removed", kind: "success", action: { label: "Undo", run } }]}
        {...h}
      />
    );
    act(() => view.getByRole("button", { name: "Undo" }).click());
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.onDismiss).toHaveBeenCalledWith(7);
    act(() => view.unmount());
  });
});
