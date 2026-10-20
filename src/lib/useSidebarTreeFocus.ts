import { type RefObject, useEffect } from "react";
import type { TreeRow } from "./sidebarKeyboard";

/** Rows the keyboard model moves between: the primary button of each
 *  visible sidebar row, in visual order. An unresolved collection link is
 *  disabled and skipped. */
const ROW_SELECTOR = '[data-tree-row="true"]:not(:disabled)';

export function sidebarTreeRows(tree: HTMLElement | null): HTMLElement[] {
  return tree ? Array.from(tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)) : [];
}

export function describeTreeRow(row: HTMLElement): TreeRow {
  const expanded = row.dataset.expanded;
  return {
    depth: Number(row.dataset.depth ?? 0),
    expanded: expanded === undefined ? null : expanded === "true",
  };
}

/**
 * Roving tabindex for the sidebar tree: exactly one row is in the Tab order,
 * so Tab moves past the tree in one step and Arrow keys move within it. The
 * tabbable row is the focused one, else the open file's row, else the last
 * row focused, else the first.
 *
 * Done on the DOM rather than through props: the rows are memoized, and
 * threading a "tabbable path" prop through them would re-render every row
 * on each arrow key. A MutationObserver re-applies it when rows appear,
 * disappear, or the open file changes.
 */
export function useSidebarTreeFocus(treeRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    let lastFocusedPath: string | null = null;

    function sync() {
      const rows = sidebarTreeRows(tree);
      if (rows.length === 0) return;
      const active =
        rows.find((row) => row === document.activeElement) ??
        rows.find((row) => row.getAttribute("aria-current") === "true") ??
        rows.find((row) => row.dataset.path === lastFocusedPath) ??
        rows[0];
      for (const row of rows) row.tabIndex = row === active ? 0 : -1;
    }

    function handleFocusIn(e: FocusEvent) {
      if (e.target instanceof HTMLElement && e.target.matches(ROW_SELECTOR)) {
        lastFocusedPath = e.target.dataset.path ?? null;
        sync();
      }
    }

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(tree, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current"],
    });
    tree.addEventListener("focusin", handleFocusIn);
    return () => {
      observer.disconnect();
      tree.removeEventListener("focusin", handleFocusIn);
    };
  }, [treeRef]);
}
