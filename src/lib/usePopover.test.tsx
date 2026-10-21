import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act } from "@testing-library/react";
import { useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { usePopover } from "./usePopover";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function Harness({
  menu = false,
  onOuterKey,
  itemsClose = false,
}: {
  menu?: boolean;
  onOuterKey?: () => void;
  /** The panel's buttons are actions that close it, like a menu's items. */
  itemsClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const onItem = itemsClose ? () => setOpen(false) : undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  usePopover({ open, onClose: () => setOpen(false), containerRef, panelRef, menu });
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test harness listener
    <div onKeyDown={() => onOuterKey?.()}>
      <input aria-label="editor" data-testid="editor" />
      <button type="button" data-testid="outside">
        outside
      </button>
      <div ref={containerRef}>
        <button type="button" data-testid="trigger" onClick={() => setOpen((v) => !v)}>
          trigger
        </button>
        {open && (
          <div ref={panelRef} data-testid="panel" role={menu ? "menu" : "dialog"}>
            <button type="button" role={menu ? "menuitem" : undefined} onClick={onItem}>
              one
            </button>
            <button type="button" role={menu ? "menuitem" : undefined} onClick={onItem}>
              two
            </button>
            <button type="button" role={menu ? "menuitem" : undefined} onClick={onItem}>
              three
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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

function q(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function key(target: Element | null, k: string) {
  act(() => {
    target?.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
    );
  });
}

/** Open the popover the way a mouse user does: focus stays in the editor
 *  (WebKit does not focus a clicked button), then the trigger is clicked. */
function openFromEditor(container: HTMLElement) {
  act(() => q(container, "editor")?.focus());
  act(() => q(container, "trigger")?.click());
}

describe("usePopover", () => {
  it("moves focus to the panel's first control when it opens", () => {
    const m = mount(<Harness />);
    openFromEditor(m.container);
    expect(document.activeElement?.textContent).toBe("one");
    unmount(m);
  });

  it("closes on Escape without letting it reach outer handlers, and returns focus", () => {
    let outer = 0;
    const m = mount(<Harness onOuterKey={() => outer++} />);
    openFromEditor(m.container);
    key(document.activeElement, "Escape");
    expect(q(m.container, "panel")).toBeNull();
    expect(outer).toBe(0);
    expect(document.activeElement).toBe(q(m.container, "editor"));
    unmount(m);
  });

  it("closes on a press outside, leaving focus where the press put it", () => {
    const m = mount(<Harness />);
    openFromEditor(m.container);
    act(() => {
      q(m.container, "outside")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      q(m.container, "outside")?.focus();
    });
    expect(q(m.container, "panel")).toBeNull();
    expect(document.activeElement).toBe(q(m.container, "outside"));
    unmount(m);
  });

  it("returns focus when a menu action closes it, so focus isn't stranded on <body>", () => {
    const m = mount(<Harness menu itemsClose />);
    openFromEditor(m.container);
    key(document.activeElement, "ArrowDown");
    act(() => (document.activeElement as HTMLElement | null)?.click());
    expect(q(m.container, "panel")).toBeNull();
    expect(document.activeElement).toBe(q(m.container, "editor"));
    unmount(m);
  });

  it("returns focus to the trigger a keyboard user opened it from", () => {
    const m = mount(<Harness menu itemsClose />);
    act(() => q(m.container, "trigger")?.focus());
    act(() => q(m.container, "trigger")?.click());
    expect(document.activeElement?.textContent).toBe("one");
    act(() => (document.activeElement as HTMLElement | null)?.click());
    expect(document.activeElement).toBe(q(m.container, "trigger"));
    unmount(m);
  });

  it("closes when focus moves outside, but not when it goes nowhere", () => {
    const m = mount(<Harness />);
    openFromEditor(m.container);
    const inside = document.activeElement;
    act(() => {
      inside?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    });
    expect(q(m.container, "panel")).not.toBeNull();
    act(() => {
      inside?.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: q(m.container, "outside") })
      );
    });
    expect(q(m.container, "panel")).toBeNull();
    unmount(m);
  });

  it("moves between menu items with the arrow keys, Home and End", () => {
    let outer = 0;
    const m = mount(<Harness menu onOuterKey={() => outer++} />);
    openFromEditor(m.container);
    expect(document.activeElement?.textContent).toBe("one");
    key(document.activeElement, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("two");
    key(document.activeElement, "End");
    expect(document.activeElement?.textContent).toBe("three");
    key(document.activeElement, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("one");
    key(document.activeElement, "ArrowUp");
    expect(document.activeElement?.textContent).toBe("three");
    key(document.activeElement, "Home");
    expect(document.activeElement?.textContent).toBe("one");
    expect(outer).toBe(0);
    unmount(m);
  });
});
