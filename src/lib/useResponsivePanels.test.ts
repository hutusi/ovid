import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { PROPERTIES_OPEN_KEY, SIDEBAR_VISIBLE_KEY } from "./uiVisibility";
import {
  PANEL_COMPACT_WIDTH,
  resolvePanelLayout,
  useResponsivePanels,
} from "./useResponsivePanels";

// A queued requestAnimationFrame mock: store callbacks, hand back non-zero ids,
// and only run them when flushRaf() is called. This lets tests observe the
// frame-coalescing gate (many resize events → one queued frame) and the
// cancel-on-unmount path that a synchronous stub would paper over.
const rafCallbacks = new Map<number, FrameRequestCallback>();
let rafId = 0;

function flushRaf() {
  const pending = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  for (const cb of pending) cb(0);
}

function resetRaf() {
  rafCallbacks.clear();
  rafId = 0;
}

function dispatchResize(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new window.Event("resize"));
}

// Set the viewport and run the queued frame so the panel state settles
// synchronously — keeps the width-driven assertions below straightforward.
function setViewportWidth(width: number) {
  dispatchResize(width);
  flushRaf();
}

describe("resolvePanelLayout", () => {
  it("keeps a 480px editor by collapsing properties and capping the sidebar", () => {
    const narrow = resolvePanelLayout({
      viewportWidth: 700,
      sidebarPreferred: true,
      propertiesPreferred: true,
      compactPropertiesOpen: false,
      propertiesAvailable: true,
    });
    expect(narrow.compact).toBe(true);
    expect(narrow.sidebarMaxWidth).toBe(220);
    expect(narrow.propertiesOpen).toBe(false);

    const boundary = resolvePanelLayout({
      viewportWidth: PANEL_COMPACT_WIDTH,
      sidebarPreferred: true,
      propertiesPreferred: true,
      compactPropertiesOpen: false,
      propertiesAvailable: true,
    });
    expect(boundary.compact).toBe(false);
    expect(boundary.propertiesOpen).toBe(true);
    expect(boundary.sidebarMaxWidth).toBe(232);
  });

  it("does not reserve inline space for unavailable or drawer properties", () => {
    const unavailable = resolvePanelLayout({
      viewportWidth: 1_200,
      sidebarPreferred: true,
      propertiesPreferred: true,
      compactPropertiesOpen: false,
      propertiesAvailable: false,
    });
    expect(unavailable.propertiesOpen).toBe(false);
    expect(unavailable.sidebarMaxWidth).toBe(720);

    const drawer = resolvePanelLayout({
      viewportWidth: 959,
      sidebarPreferred: true,
      propertiesPreferred: true,
      compactPropertiesOpen: true,
      propertiesAvailable: true,
    });
    expect(drawer.propertiesDrawer).toBe(true);
    expect(drawer.sidebarMaxWidth).toBe(479);
  });
});

describe("useResponsivePanels", () => {
  let unmountHook: (() => void) | null = null;
  let realRaf: typeof window.requestAnimationFrame;
  let realCancelRaf: typeof window.cancelAnimationFrame;

  beforeAll(() => {
    registerHappyDom();
    // The resize handler coalesces updates through requestAnimationFrame; use a
    // queued mock so tests can drive the frame explicitly (see flushRaf).
    realRaf = window.requestAnimationFrame;
    realCancelRaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafId += 1;
      rafCallbacks.set(rafId, cb);
      return rafId;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      rafCallbacks.delete(id);
    }) as typeof window.cancelAnimationFrame;
  });
  afterEach(() => {
    unmountHook?.();
    unmountHook = null;
  });
  afterAll(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancelRaf;
    unregisterHappyDom();
  });

  beforeEach(() => {
    resetRaf();
    localStorage.clear();
    setViewportWidth(700);
  });

  function renderPanels(blockingOverlayOpen = false) {
    const rendered = renderHook(() => {
      const [sidebarPreferred, setSidebarPreferred] = useState(true);
      const [propertiesPreferred, setPropertiesPreferred] = useState(true);
      const panels = useResponsivePanels({
        sidebarPreferred,
        setSidebarPreferred,
        propertiesPreferred,
        setPropertiesPreferred,
        propertiesAvailable: true,
        blockingOverlayOpen,
      });
      return { panels, sidebarPreferred, propertiesPreferred };
    });
    unmountHook = rendered.unmount;
    return rendered;
  }

  it("uses a transient compact drawer and restores the desktop preference", () => {
    const { result } = renderPanels();
    expect(result.current.panels.propertiesOpen).toBe(false);

    act(() => result.current.panels.toggleProperties());
    expect(result.current.panels.propertiesOpen).toBe(true);
    expect(result.current.panels.propertiesDrawer).toBe(true);
    expect(result.current.propertiesPreferred).toBe(true);
    expect(localStorage.getItem(PROPERTIES_OPEN_KEY)).toBeNull();

    act(() => setViewportWidth(1_200));
    expect(result.current.panels.compact).toBe(false);
    expect(result.current.panels.propertiesOpen).toBe(true);
    expect(result.current.panels.propertiesDrawer).toBe(false);
  });

  it("persists desktop toggles and sidebar visibility", () => {
    setViewportWidth(1_200);
    const { result } = renderPanels();

    act(() => result.current.panels.toggleProperties());
    expect(result.current.propertiesPreferred).toBe(false);
    expect(localStorage.getItem(PROPERTIES_OPEN_KEY)).toBe("false");

    act(() => result.current.panels.toggleSidebar());
    expect(result.current.sidebarPreferred).toBe(false);
    expect(localStorage.getItem(SIDEBAR_VISIBLE_KEY)).toBe("false");
    act(() => result.current.panels.showSidebar());
    expect(result.current.sidebarPreferred).toBe(true);
    expect(localStorage.getItem(SIDEBAR_VISIBLE_KEY)).toBe("true");
  });

  it("dismisses the compact drawer with Escape", () => {
    const { result } = renderPanels();
    act(() => result.current.panels.toggleProperties());
    expect(result.current.panels.propertiesDrawer).toBe(true);

    act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.panels.propertiesOpen).toBe(false);
  });

  it("coalesces multiple resize events into a single frame", () => {
    const { result } = renderPanels();
    expect(result.current.panels.compact).toBe(true); // initial 700 < 960

    act(() => {
      dispatchResize(1_200);
      dispatchResize(1_100);
      dispatchResize(1_000);
    });
    // The frame gate queues exactly one callback for the whole burst, and no
    // state update lands until that frame runs.
    expect(rafCallbacks.size).toBe(1);
    expect(result.current.panels.compact).toBe(true);

    act(() => flushRaf());
    // The single coalesced update reflects the latest width (1000 ≥ 960).
    expect(result.current.panels.compact).toBe(false);
  });

  it("cancels the pending frame on unmount", () => {
    const rendered = renderPanels();
    act(() => dispatchResize(1_200));
    expect(rafCallbacks.size).toBe(1);

    act(() => rendered.unmount());
    unmountHook = null; // already unmounted — don't let afterEach double-unmount
    // The effect cleanup cancelled the queued frame, so nothing runs later.
    expect(rafCallbacks.size).toBe(0);
  });

  it("leaves Escape to an open nested modal", () => {
    const { result } = renderPanels();
    act(() => result.current.panels.toggleProperties());
    expect(result.current.panels.propertiesDrawer).toBe(true);

    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })));
    // A real modal is open → the drawer must not steal Escape and close itself.
    expect(result.current.panels.propertiesOpen).toBe(true);

    modal.remove();
    act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.panels.propertiesOpen).toBe(false);
  });
});
