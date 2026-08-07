import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { useSessionWords } from "./useSessionWords";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

describe("useSessionWords", () => {
  it("baselines a file at its first reported count", () => {
    const { result } = renderHook(() => useSessionWords());
    expect(result.current.sessionWordsAdded).toBe(0);
    act(() => result.current.noteWordCount("a.md", 500));
    expect(result.current.sessionWordsAdded).toBe(0);
  });

  it("counts words added to a file", () => {
    const { result } = renderHook(() => useSessionWords());
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    expect(result.current.sessionWordsAdded).toBe(20);
  });

  it("accumulates across files and survives switching", () => {
    const { result } = renderHook(() => useSessionWords());
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    // Opening another file (its initial emission) must not erase progress.
    act(() => result.current.noteWordCount("b.md", 300));
    expect(result.current.sessionWordsAdded).toBe(20);
    act(() => result.current.noteWordCount("b.md", 304));
    expect(result.current.sessionWordsAdded).toBe(24);
  });

  it("keeps a file's baseline when it is re-opened", () => {
    const { result } = renderHook(() => useSessionWords());
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 520));
    // Re-open: the remounted editor re-emits the current total.
    act(() => result.current.noteWordCount("a.md", 520));
    expect(result.current.sessionWordsAdded).toBe(20);
  });

  it("lets deletions in one file offset additions in another", () => {
    const { result } = renderHook(() => useSessionWords());
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("b.md", 300));
    act(() => result.current.noteWordCount("a.md", 530));
    act(() => result.current.noteWordCount("b.md", 290));
    expect(result.current.sessionWordsAdded).toBe(20);
  });

  it("clamps a net-negative session at zero", () => {
    const { result } = renderHook(() => useSessionWords());
    act(() => result.current.noteWordCount("a.md", 500));
    act(() => result.current.noteWordCount("a.md", 400));
    expect(result.current.sessionWordsAdded).toBe(0);
  });
});
