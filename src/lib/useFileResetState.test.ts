import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FileNode } from "./types";
import { useFileResetState } from "./useFileResetState";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function file(path: string): FileNode {
  return { name: path, path, isDirectory: false };
}

type Props = { selectedFile: FileNode | null; wordCount: number };

function render(initial: Props) {
  return renderHook((props: Props) => useFileResetState(props.selectedFile, props.wordCount), {
    initialProps: initial,
  });
}

describe("useFileResetState", () => {
  it("reports no session words before a baseline is captured", () => {
    const { result, rerender } = render({ selectedFile: file("a.md"), wordCount: 0 });
    expect(result.current.sessionWordsAdded).toBe(0);
    // The document's real count arriving without a baseline (e.g. the debounced
    // typing path firing first) must not count as session progress.
    rerender({ selectedFile: file("a.md"), wordCount: 500 });
    expect(result.current.sessionWordsAdded).toBe(0);
  });

  it("measures added words against the captured baseline", () => {
    const selectedFile = file("a.md");
    const { result, rerender } = render({ selectedFile, wordCount: 500 });
    act(() => result.current.captureSessionBaseline(500));
    expect(result.current.sessionWordsAdded).toBe(0);
    rerender({ selectedFile, wordCount: 502 });
    expect(result.current.sessionWordsAdded).toBe(2);
  });

  it("clamps to zero when words are deleted below the baseline", () => {
    const selectedFile = file("a.md");
    const { result, rerender } = render({ selectedFile, wordCount: 500 });
    act(() => result.current.captureSessionBaseline(500));
    rerender({ selectedFile, wordCount: 490 });
    expect(result.current.sessionWordsAdded).toBe(0);
  });

  it("rebaselines when the next document emits its initial count", () => {
    const { result, rerender } = render({ selectedFile: file("a.md"), wordCount: 520 });
    act(() => result.current.captureSessionBaseline(500));
    expect(result.current.sessionWordsAdded).toBe(20);
    // Switch: wordCount resets before the new editor emits; the stale
    // baseline must not produce a phantom delta in between (clamped to 0).
    rerender({ selectedFile: file("b.md"), wordCount: 0 });
    expect(result.current.sessionWordsAdded).toBe(0);
    act(() => result.current.captureSessionBaseline(300));
    rerender({ selectedFile: file("b.md"), wordCount: 304 });
    expect(result.current.sessionWordsAdded).toBe(4);
  });

  it("resets cover-image visibility when the selected file changes", () => {
    const { result, rerender } = render({ selectedFile: file("a.md"), wordCount: 0 });
    act(() => result.current.toggleCoverImage());
    expect(result.current.coverImageVisible).toBe(true);
    rerender({ selectedFile: file("b.md"), wordCount: 0 });
    expect(result.current.coverImageVisible).toBe(false);
  });
});
