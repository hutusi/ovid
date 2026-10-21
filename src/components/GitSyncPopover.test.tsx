import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { GitSyncPopoverState } from "../lib/gitUi";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { GitSyncPopover } from "./GitSyncPopover";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

const state: GitSyncPopoverState = {
  label: "ahead",
  title: "Ahead",
  tracking: "origin/main",
  description: "1 commit to push.",
  actionKind: "push",
  actionLabel: "Push",
};

function mount(ui: React.ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  // biome-ignore lint/style/noNonNullAssertion: assigned inside act above
  return { root: root!, container };
}

describe("GitSyncPopover", () => {
  it("renders on the shared Modal and runs its action", () => {
    let acted = 0;
    const m = mount(<GitSyncPopover state={state} onClose={() => {}} onAction={() => acted++} />);
    const dialog = m.container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.className).toBe("modal-panel git-sync-popover-panel");
    act(() => m.container.querySelector<HTMLButtonElement>(".modal-btn-primary")?.click());
    expect(acted).toBe(1);
    act(() => m.root.unmount());
    m.container.remove();
  });

  it("closes on Escape", () => {
    let closed = 0;
    const m = mount(<GitSyncPopover state={state} onClose={() => closed++} />);
    act(() => {
      m.container
        .querySelector('[role="dialog"]')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closed).toBe(1);
    act(() => m.root.unmount());
    m.container.remove();
  });
});
