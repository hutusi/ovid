import { describe, expect, it } from "bun:test";
import { type TreeRow, treeKeyAction } from "./sidebarKeyboard";

// posts/ (open)
//   hello.md
//   series/ (closed)
// notes/ (closed)
const rows: TreeRow[] = [
  { depth: 0, expanded: true },
  { depth: 1, expanded: null },
  { depth: 1, expanded: false },
  { depth: 0, expanded: false },
];

describe("treeKeyAction", () => {
  it("steps up and down through visible rows, stopping at the ends", () => {
    expect(treeKeyAction(rows, 0, "ArrowDown")).toEqual({ kind: "focus", index: 1 });
    expect(treeKeyAction(rows, 3, "ArrowDown")).toBeNull();
    expect(treeKeyAction(rows, 2, "ArrowUp")).toEqual({ kind: "focus", index: 1 });
    expect(treeKeyAction(rows, 0, "ArrowUp")).toBeNull();
  });

  it("jumps to the first and last rows", () => {
    expect(treeKeyAction(rows, 2, "Home")).toEqual({ kind: "focus", index: 0 });
    expect(treeKeyAction(rows, 1, "End")).toEqual({ kind: "focus", index: 3 });
    expect(treeKeyAction(rows, 0, "Home")).toBeNull();
  });

  it("Right expands a closed folder and steps into an open one", () => {
    expect(treeKeyAction(rows, 3, "ArrowRight")).toEqual({ kind: "expand" });
    expect(treeKeyAction(rows, 0, "ArrowRight")).toEqual({ kind: "focus", index: 1 });
    expect(treeKeyAction(rows, 1, "ArrowRight")).toBeNull();
  });

  it("Right on an open folder with no visible children does nothing", () => {
    const empty: TreeRow[] = [
      { depth: 0, expanded: true },
      { depth: 0, expanded: false },
    ];
    expect(treeKeyAction(empty, 0, "ArrowRight")).toBeNull();
  });

  it("Left collapses an open folder and steps out to the parent row", () => {
    expect(treeKeyAction(rows, 0, "ArrowLeft")).toEqual({ kind: "collapse" });
    expect(treeKeyAction(rows, 2, "ArrowLeft")).toEqual({ kind: "focus", index: 0 });
    expect(treeKeyAction(rows, 1, "ArrowLeft")).toEqual({ kind: "focus", index: 0 });
    expect(treeKeyAction(rows, 3, "ArrowLeft")).toBeNull();
  });

  it("ignores other keys and out-of-range rows", () => {
    expect(treeKeyAction(rows, 0, "a")).toBeNull();
    expect(treeKeyAction(rows, 9, "ArrowDown")).toBeNull();
  });
});
