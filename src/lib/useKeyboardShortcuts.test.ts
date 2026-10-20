import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { AppActionCtx } from "./appActions";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { OverlayStack } from "./useOverlayStack";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function makeCtx(toggleSidebar: () => void): AppActionCtx {
  const overlay: OverlayStack = {
    active: null,
    is: () => false,
    open: () => {},
    close: () => {},
    isBlocking: false,
  };
  return { overlay, zenMode: false, toggleSidebar } as unknown as AppActionCtx;
}

function pressToggleSidebar() {
  window.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "l", metaKey: true, shiftKey: true })
  );
}

describe("useKeyboardShortcuts", () => {
  it("listens once and always dispatches to the latest context", () => {
    const added: string[] = [];
    const originalAdd = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "keydown") added.push(type);
      return (originalAdd as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof window.addEventListener;

    const calls: string[] = [];
    const { rerender, unmount } = renderHook(({ ctx }) => useKeyboardShortcuts(ctx), {
      initialProps: { ctx: makeCtx(() => calls.push("first")) },
    });
    rerender({ ctx: makeCtx(() => calls.push("second")) });
    rerender({ ctx: makeCtx(() => calls.push("latest")) });
    window.addEventListener = originalAdd;

    expect(added).toHaveLength(1);
    pressToggleSidebar();
    expect(calls).toEqual(["latest"]);
    unmount();
  });
});
