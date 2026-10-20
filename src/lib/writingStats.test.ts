import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { createWritingStats, useWritingStats, type WritingStats } from "./writingStats";

/** Session progress shown for `path`, as the status bar computes it. */
function added(stats: WritingStats, path: string): number {
  return Math.max(0, stats.getSnapshot().deltas.get(path) ?? 0);
}

describe("writing stats — session progress", () => {
  it("baselines a file at its first reported count", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    expect(added(stats, "a.md")).toBe(0);
    expect(stats.getSnapshot().counts.get("a.md")).toBe(500);
  });

  it("counts words added to a file", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    stats.report("a.md", 520);
    expect(added(stats, "a.md")).toBe(20);
  });

  it("keeps each file's progress separately across switches", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    stats.report("a.md", 520);
    stats.report("b.md", 300);
    expect(added(stats, "b.md")).toBe(0);
    stats.report("b.md", 304);
    expect(added(stats, "b.md")).toBe(4);
    // Re-open a.md: the remounted editor re-emits its current total.
    stats.report("a.md", 520, "open");
    expect(added(stats, "a.md")).toBe(20);
  });

  it("clamps net deletions at zero", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    stats.report("a.md", 400);
    expect(added(stats, "a.md")).toBe(0);
  });

  it("migrates progress when the file is renamed", () => {
    const stats = createWritingStats();
    stats.report("old.md", 500);
    stats.report("old.md", 700);
    stats.pathRenamed("old.md", "new.md");
    stats.report("new.md", 700);
    expect(added(stats, "new.md")).toBe(200);
    expect(stats.getSnapshot().counts.has("old.md")).toBe(false);
  });

  it("migrates progress when an ancestor folder is renamed", () => {
    const stats = createWritingStats();
    stats.report("notes/a.md", 500);
    stats.report("notes/a.md", 520);
    stats.pathRenamed("notes", "journal");
    stats.report("journal/a.md", 520);
    expect(added(stats, "journal/a.md")).toBe(20);
  });

  it("forgets a deleted file so a recreation at the same path starts fresh", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    stats.pathRemoved("a.md");
    stats.report("a.md", 3);
    stats.report("a.md", 10);
    expect(added(stats, "a.md")).toBe(7);
  });

  it("rebaselines on external reload so foreign words are not session progress", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    stats.report("a.md", 520);
    stats.report("a.md", 800, "reload");
    expect(added(stats, "a.md")).toBe(0);
    stats.report("a.md", 805);
    expect(added(stats, "a.md")).toBe(5);
  });

  it("rebaselining after external truncation lets new typing count immediately", () => {
    const stats = createWritingStats();
    stats.report("a.md", 500);
    stats.report("a.md", 100, "reload");
    stats.report("a.md", 110);
    expect(added(stats, "a.md")).toBe(10);
  });

  it("notifies only on an actual change", () => {
    const stats = createWritingStats();
    let notifications = 0;
    stats.subscribe(() => {
      notifications += 1;
    });
    stats.report("a.md", 500);
    stats.report("a.md", 500);
    stats.pathRenamed("other.md", "else.md");
    expect(notifications).toBe(1);
  });
});

describe("useWritingStats", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("reads the open file's count and progress, and nothing without a file", () => {
    const stats = createWritingStats();
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useWritingStats(stats, path),
      { initialProps: { path: "a.md" as string | null } }
    );
    act(() => stats.report("a.md", 500));
    act(() => stats.report("a.md", 520));
    expect(result.current).toEqual({ wordCount: 520, sessionWordsAdded: 20 });
    rerender({ path: null });
    expect(result.current).toEqual({ wordCount: 0, sessionWordsAdded: 0 });
  });
});
