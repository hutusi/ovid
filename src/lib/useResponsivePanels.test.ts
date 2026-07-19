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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new window.Event("resize"));
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

  beforeAll(registerHappyDom);
  afterEach(() => {
    unmountHook?.();
    unmountHook = null;
  });
  afterAll(unregisterHappyDom);

  beforeEach(() => {
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
});
