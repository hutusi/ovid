/** One focusable sidebar row as the keyboard model sees it, in visual
 *  (DOM) order. `expanded` is null for a leaf (file, translation, collection
 *  link) and a boolean for a folder. */
export interface TreeRow {
  depth: number;
  expanded: boolean | null;
}

export type TreeKeyAction =
  | { kind: "focus"; index: number }
  | { kind: "expand" }
  | { kind: "collapse" }
  | null;

/**
 * What a key does on the focused sidebar row, following the WAI-ARIA tree
 * pattern: Up/Down step through visible rows, Home/End jump to the ends,
 * Right expands a closed folder or steps into an open one, Left collapses
 * an open folder or steps out to the parent row.
 */
export function treeKeyAction(rows: TreeRow[], index: number, key: string): TreeKeyAction {
  const row = rows[index];
  if (!row) return null;
  switch (key) {
    case "ArrowDown":
      return index < rows.length - 1 ? { kind: "focus", index: index + 1 } : null;
    case "ArrowUp":
      return index > 0 ? { kind: "focus", index: index - 1 } : null;
    case "Home":
      return index > 0 ? { kind: "focus", index: 0 } : null;
    case "End":
      return index < rows.length - 1 ? { kind: "focus", index: rows.length - 1 } : null;
    case "ArrowRight": {
      if (row.expanded === false) return { kind: "expand" };
      const next = rows[index + 1];
      if (row.expanded === true && next && next.depth > row.depth) {
        return { kind: "focus", index: index + 1 };
      }
      return null;
    }
    case "ArrowLeft": {
      if (row.expanded === true) return { kind: "collapse" };
      for (let i = index - 1; i >= 0; i--) {
        if (rows[i].depth < row.depth) return { kind: "focus", index: i };
      }
      return null;
    }
    default:
      return null;
  }
}
