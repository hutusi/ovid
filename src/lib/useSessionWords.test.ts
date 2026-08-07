import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { useSessionWords } from "./useSessionWords";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function render(initialPath: string | null) {
  return renderHook(({ path }: { path: string | null }) => useSessionWords(path), {
    initialProps: { path: initialPath },
  });
}

describe("useSessionWords", () => {
  it("baselines a file at its first reported count", () => {
    const { result } = render("a.md");
    expect(result.current.sessionWordsAdded).toBe(0);
    act(() => result.current.noteWordCount("a.md", 500));
    expect(result.current.sessionWordsAdded).toBe(0);
  });

  it("counts words added to the current file", () => {
    const { result } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    expect(result.current.sessionWordsAdded).toBe(20);
  });

  it("scopes the badge to the current file", () => {
    const { result, rerender } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    // The freshly-opened file shows its own (empty) progress, not a.md's.
    rerender({ path: "b.md" });
    act(() => result.current.noteWordCount("b.md", 300));
    expect(result.current.sessionWordsAdded).toBe(0);
    act(() => result.current.noteWordCount("b.md", 304));
    expect(result.current.sessionWordsAdded).toBe(4);
  });

  it("restores a file's progress when switching back to it", () => {
    const { result, rerender } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    rerender({ path: "b.md" });
    act(() => result.current.noteWordCount("b.md", 300));
    // Re-open: the remounted editor re-emits the current total; the
    // session baseline must survive both the switch and the re-emission.
    rerender({ path: "a.md" });
    act(() => result.current.noteWordCount("a.md", 520));
    expect(result.current.sessionWordsAdded).toBe(20);
  });

  it("clamps net deletions at zero", () => {
    const { result } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 400));
    expect(result.current.sessionWordsAdded).toBe(0);
  });

  it("shows nothing when no file is open", () => {
    const { result, rerender } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    rerender({ path: null });
    expect(result.current.sessionWordsAdded).toBe(0);
  });

  it("migrates progress when the file is renamed", () => {
    const { result, rerender } = render("old.md");
    act(() => result.current.noteWordCount("old.md", 500));
    act(() => result.current.noteWordCount("old.md", 700));
    act(() => result.current.notePathRenamed("old.md", "new.md"));
    rerender({ path: "new.md" });
    // The remounted editor re-emits the current total at the new path; the
    // migrated baseline must absorb it instead of re-baselining at 700.
    act(() => result.current.noteWordCount("new.md", 700));
    expect(result.current.sessionWordsAdded).toBe(200);
  });

  it("migrates progress when an ancestor directory is renamed", () => {
    const { result, rerender } = render("notes/a.md");
    act(() => result.current.noteWordCount("notes/a.md", 500));
    act(() => result.current.noteWordCount("notes/a.md", 520));
    act(() => result.current.notePathRenamed("notes", "journal"));
    rerender({ path: "journal/a.md" });
    act(() => result.current.noteWordCount("journal/a.md", 520));
    expect(result.current.sessionWordsAdded).toBe(20);
  });

  it("forgets a deleted file so a recreation at the same path starts fresh", () => {
    const { result } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.notePathRemoved("a.md"));
    act(() => result.current.noteWordCount("a.md", 3));
    act(() => result.current.noteWordCount("a.md", 10));
    expect(result.current.sessionWordsAdded).toBe(7);
  });

  it("rebaselines on external reload so foreign words are not session progress", () => {
    const { result } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    // git pull rewrote the file to 800 words under the same mount.
    act(() => result.current.rebaselineWordCount("a.md", 800));
    expect(result.current.sessionWordsAdded).toBe(0);
    act(() => result.current.noteWordCount("a.md", 805));
    expect(result.current.sessionWordsAdded).toBe(5);
  });

  it("rebaselining after external truncation lets new typing count immediately", () => {
    const { result } = render("a.md");
    act(() => result.current.noteWordCount("a.md", 500));
    // External truncation to 100 words; without rebaselining, the −400
    // delta would swallow the writer's next 400 genuinely-typed words.
    act(() => result.current.rebaselineWordCount("a.md", 100));
    act(() => result.current.noteWordCount("a.md", 110));
    expect(result.current.sessionWordsAdded).toBe(10);
  });
});
