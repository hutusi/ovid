import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FileNode } from "./types";
import { useCoverImage } from "./useCoverImage";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function file(path: string): FileNode {
  return { name: path, path, isDirectory: false };
}

describe("useCoverImage", () => {
  it("toggles visibility and hides again on file switch", () => {
    const { result, rerender } = renderHook(({ node }: { node: FileNode }) => useCoverImage(node), {
      initialProps: { node: file("a.md") },
    });
    expect(result.current.coverImageVisible).toBe(false);
    act(() => result.current.toggleCoverImage());
    expect(result.current.coverImageVisible).toBe(true);
    rerender({ node: file("b.md") });
    expect(result.current.coverImageVisible).toBe(false);
  });
});
