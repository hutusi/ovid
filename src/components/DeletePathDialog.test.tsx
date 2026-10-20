import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}(${JSON.stringify(vars)})` : key,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { DeletePathDialog } from "./DeletePathDialog";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

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

function unmount({ root, container }: { root: Root; container: HTMLElement }) {
  act(() => root.unmount());
  container.remove();
}

describe("DeletePathDialog", () => {
  it("names the file and confirms with the red Move to Trash button", () => {
    let confirmed = 0;
    const m = mount(
      <DeletePathDialog name="hello.md" onConfirm={() => confirmed++} onCancel={() => {}} />
    );
    expect(m.container.querySelector(".modal-title")?.textContent).toBe(
      'confirm.move_to_trash({"name":"hello.md"})'
    );
    const confirm = m.container.querySelector<HTMLButtonElement>(".modal-btn-danger-solid");
    expect(confirm?.textContent).toBe("confirm.move_to_trash_action");
    act(() => confirm?.click());
    expect(confirmed).toBe(1);
    unmount(m);
  });

  it("starts focus on Cancel so a stray Enter does not delete", () => {
    const m = mount(<DeletePathDialog name="hello.md" onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.activeElement?.className).toContain("modal-btn-cancel");
    unmount(m);
  });

  it("cancels on Escape without confirming", () => {
    let cancelled = 0;
    let confirmed = 0;
    const m = mount(
      <DeletePathDialog
        name="hello.md"
        onConfirm={() => confirmed++}
        onCancel={() => cancelled++}
      />
    );
    const dialog = m.container.querySelector<HTMLElement>('[role="dialog"]');
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(cancelled).toBe(1);
    expect(confirmed).toBe(0);
    unmount(m);
  });
});
