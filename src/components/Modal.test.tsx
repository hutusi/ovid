import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { Modal, ModalActions } from "./Modal";

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

describe("Modal", () => {
  it("renders dialog ARIA and the shared shell classes", () => {
    const m = mount(
      <Modal ariaLabel="Test dialog" onClose={() => {}}>
        <p>content</p>
      </Modal>
    );
    const dialog = m.container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Test dialog");
    expect(dialog?.className).toBe("modal-panel");
    expect(m.container.querySelector(".modal-overlay")).not.toBeNull();
    expect(m.container.querySelector(".modal-backdrop")).not.toBeNull();
    unmount(m);
  });

  it("appends panelClassName and applies width", () => {
    const m = mount(
      <Modal ariaLabel="x" onClose={() => {}} panelClassName="gitcred-panel" width={420}>
        <p>content</p>
      </Modal>
    );
    const dialog = m.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.className).toBe("modal-panel gitcred-panel");
    expect(dialog?.style.width).toBe("420px");
    unmount(m);
  });

  it("bare replaces the panel class; top placement adds the overlay modifier", () => {
    const m = mount(
      <Modal ariaLabel="x" onClose={() => {}} bare panelClassName="fs-panel" placement="top">
        <p>content</p>
      </Modal>
    );
    expect(m.container.querySelector<HTMLElement>('[role="dialog"]')?.className).toBe("fs-panel");
    expect(m.container.querySelector(".modal-overlay--top")).not.toBeNull();
    unmount(m);
  });

  it("closes on Escape and stops propagation", () => {
    let closed = 0;
    let leaked = 0;
    const m = mount(
      // biome-ignore lint/a11y/noStaticElementInteractions: test harness listener
      <div onKeyDown={() => leaked++}>
        <Modal ariaLabel="x" onClose={() => closed++}>
          <button type="button">ok</button>
        </Modal>
      </div>
    );
    const dialog = m.container.querySelector<HTMLElement>('[role="dialog"]');
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closed).toBe(1);
    expect(leaked).toBe(0);
    unmount(m);
  });

  it("runs the child onKeyDown first and lets it intercept Escape", () => {
    let closed = 0;
    const keys: string[] = [];
    const m = mount(
      <Modal
        ariaLabel="x"
        onClose={() => closed++}
        onKeyDown={(e) => {
          keys.push(e.key);
          if (e.key === "Escape") e.preventDefault();
        }}
      >
        <button type="button">ok</button>
      </Modal>
    );
    const dialog = m.container.querySelector<HTMLElement>('[role="dialog"]');
    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(keys).toEqual(["Escape", "Enter"]);
    expect(closed).toBe(0);
    unmount(m);
  });

  it("closes on backdrop click", () => {
    let closed = 0;
    const m = mount(
      <Modal ariaLabel="x" onClose={() => closed++}>
        <button type="button">ok</button>
      </Modal>
    );
    const backdrop = m.container.querySelector<HTMLButtonElement>(".modal-backdrop");
    act(() => {
      backdrop?.click();
    });
    expect(closed).toBe(1);
    unmount(m);
  });

  it("moves focus into the dialog on mount", () => {
    const m = mount(
      <Modal ariaLabel="x" onClose={() => {}}>
        <input aria-label="field" />
      </Modal>
    );
    const dialog = m.container.querySelector('[role="dialog"]');
    expect(dialog?.contains(document.activeElement)).toBe(true);
    unmount(m);
  });
});

describe("ModalActions", () => {
  it("renders cancel/confirm with the shared classes and disabled state", () => {
    let cancelled = 0;
    let confirmed = 0;
    const m = mount(
      <ModalActions
        cancelLabel="Cancel"
        confirmLabel="Create"
        onCancel={() => cancelled++}
        onConfirm={() => confirmed++}
        confirmDisabled
        extraLeft={<button type="button" className="modal-btn modal-btn-danger" />}
      />
    );
    const cancel = m.container.querySelector<HTMLButtonElement>(".modal-btn-cancel");
    const confirm = m.container.querySelector<HTMLButtonElement>(".modal-btn-primary");
    expect(cancel?.textContent).toBe("Cancel");
    expect(confirm?.textContent).toBe("Create");
    expect(confirm?.disabled).toBe(true);
    expect(m.container.querySelector(".modal-btn-danger")).not.toBeNull();
    expect(m.container.querySelector(".modal-spacer")).not.toBeNull();
    act(() => cancel?.click());
    expect(cancelled).toBe(1);
    unmount(m);
  });
});
