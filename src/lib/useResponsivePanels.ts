import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PROPERTIES_OPEN_KEY, SIDEBAR_VISIBLE_KEY, togglePersisted } from "./uiVisibility";

export const PANEL_COMPACT_WIDTH = 960;
export const EDITOR_MIN_WIDTH = 480;
export const PROPERTIES_PANEL_WIDTH = 248;
export const SIDEBAR_MIN_WIDTH = 180;

interface ResolvePanelLayoutOptions {
  viewportWidth: number;
  sidebarPreferred: boolean;
  propertiesPreferred: boolean;
  compactPropertiesOpen: boolean;
  propertiesAvailable: boolean;
}

export interface ResolvedPanelLayout {
  compact: boolean;
  sidebarVisible: boolean;
  propertiesOpen: boolean;
  propertiesDrawer: boolean;
  sidebarMaxWidth: number;
}

export function resolvePanelLayout({
  viewportWidth,
  sidebarPreferred,
  propertiesPreferred,
  compactPropertiesOpen,
  propertiesAvailable,
}: ResolvePanelLayoutOptions): ResolvedPanelLayout {
  const compact = viewportWidth < PANEL_COMPACT_WIDTH;
  const propertiesOpen =
    propertiesAvailable && (compact ? compactPropertiesOpen : propertiesPreferred);
  const inlinePropertiesWidth = propertiesOpen && !compact ? PROPERTIES_PANEL_WIDTH : 0;
  return {
    compact,
    sidebarVisible: sidebarPreferred,
    propertiesOpen,
    propertiesDrawer: compact && propertiesOpen,
    sidebarMaxWidth: Math.max(
      SIDEBAR_MIN_WIDTH,
      viewportWidth - EDITOR_MIN_WIDTH - inlinePropertiesWidth
    ),
  };
}

interface UseResponsivePanelsOptions {
  sidebarPreferred: boolean;
  setSidebarPreferred: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesPreferred: boolean;
  setPropertiesPreferred: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesAvailable: boolean;
  blockingOverlayOpen: boolean;
}

export interface ResponsivePanels extends ResolvedPanelLayout {
  toggleSidebar: () => void;
  showSidebar: () => void;
  toggleProperties: () => void;
  dismissPropertiesDrawer: () => void;
}

export function useResponsivePanels({
  sidebarPreferred,
  setSidebarPreferred,
  propertiesPreferred,
  setPropertiesPreferred,
  propertiesAvailable,
  blockingOverlayOpen,
}: UseResponsivePanelsOptions): ResponsivePanels {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [compactPropertiesOpen, setCompactPropertiesOpen] = useState(false);

  useEffect(() => {
    // Coalesce resize events to one state update per animation frame — a raw
    // per-event handler re-renders the whole App (including the mounted editor)
    // continuously during a live window drag. viewportWidth still tracks the
    // width (the sidebar max-width clamp needs it); the frame gate just bounds
    // the update rate, and the equality check skips no-op updates.
    let frame = 0;
    const handleResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setViewportWidth((prev) => (prev === window.innerWidth ? prev : window.innerWidth));
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const layout = useMemo(
    () =>
      resolvePanelLayout({
        viewportWidth,
        sidebarPreferred,
        propertiesPreferred,
        compactPropertiesOpen,
        propertiesAvailable,
      }),
    [
      viewportWidth,
      sidebarPreferred,
      propertiesPreferred,
      compactPropertiesOpen,
      propertiesAvailable,
    ]
  );

  useEffect(() => {
    if (!layout.compact || !propertiesAvailable) setCompactPropertiesOpen(false);
  }, [layout.compact, propertiesAvailable]);

  useEffect(() => {
    if (!layout.propertiesDrawer || blockingOverlayOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A nested modal (e.g. the add-custom-field dialog) owns Escape while open;
      // don't steal it and close the drawer underneath. The drawer isn't
      // aria-modal, so any [aria-modal="true"] node is a real Modal whose own
      // (bubble-phase) Escape handler should run instead.
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setCompactPropertiesOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [layout.propertiesDrawer, blockingOverlayOpen]);

  const toggleSidebar = useCallback(
    () => togglePersisted(setSidebarPreferred, SIDEBAR_VISIBLE_KEY),
    [setSidebarPreferred]
  );
  const showSidebar = useCallback(() => {
    setSidebarPreferred(true);
    localStorage.setItem(SIDEBAR_VISIBLE_KEY, "true");
  }, [setSidebarPreferred]);
  const toggleProperties = useCallback(() => {
    if (!propertiesAvailable) return;
    if (viewportWidth < PANEL_COMPACT_WIDTH) {
      setCompactPropertiesOpen((open) => !open);
      return;
    }
    togglePersisted(setPropertiesPreferred, PROPERTIES_OPEN_KEY);
  }, [propertiesAvailable, viewportWidth, setPropertiesPreferred]);
  const dismissPropertiesDrawer = useCallback(() => {
    setCompactPropertiesOpen(false);
  }, []);

  return {
    ...layout,
    toggleSidebar,
    showSidebar,
    toggleProperties,
    dismissPropertiesDrawer,
  };
}
