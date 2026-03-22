import { describe, expect, it, mock } from "bun:test";
import { STORAGE_KEY, syncRecentDelete, syncRecentRename } from "./useRecentFiles";

function makeStorage(getItem: ReturnType<typeof mock>, setItem: ReturnType<typeof mock>): Storage {
  return {
    length: 0,
    clear() {},
    getItem,
    key() {
      return null;
    },
    removeItem() {},
    setItem,
  };
}

describe("syncRecentRename", () => {
  it("rewrites exact recent paths for renamed files", () => {
    const getItem = mock(() =>
      JSON.stringify([{ path: "/workspace/content/posts/hello.md", name: "hello.md" }])
    );
    const setItem = mock(() => {});
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = makeStorage(getItem, setItem);

    syncRecentRename(
      "/workspace/content",
      "/workspace/content/posts/hello.md",
      "/workspace/content/posts/renamed.md"
    );

    expect(setItem).toHaveBeenCalledWith(
      `${STORAGE_KEY}:/workspace/content`,
      JSON.stringify([{ path: "/workspace/content/posts/renamed.md", name: "hello.md" }])
    );

    globalThis.localStorage = originalStorage;
  });

  it("rewrites nested recent paths for renamed folders", () => {
    const getItem = mock(() =>
      JSON.stringify([{ path: "/workspace/content/posts/hello/index.md", name: "hello" }])
    );
    const setItem = mock(() => {});
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = makeStorage(getItem, setItem);

    syncRecentRename(
      "/workspace/content",
      "/workspace/content/posts/hello",
      "/workspace/content/posts/renamed"
    );

    expect(setItem).toHaveBeenCalledWith(
      `${STORAGE_KEY}:/workspace/content`,
      JSON.stringify([{ path: "/workspace/content/posts/renamed/index.md", name: "hello" }])
    );

    globalThis.localStorage = originalStorage;
  });
});

describe("syncRecentDelete", () => {
  it("removes deleted files and folder descendants from recents", () => {
    const getItem = mock(() =>
      JSON.stringify([
        { path: "/workspace/content/posts/hello/index.md", name: "hello" },
        { path: "/workspace/content/posts/keep.md", name: "keep.md" },
      ])
    );
    const setItem = mock(() => {});
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = makeStorage(getItem, setItem);

    syncRecentDelete("/workspace/content", "/workspace/content/posts/hello");

    expect(setItem).toHaveBeenCalledWith(
      `${STORAGE_KEY}:/workspace/content`,
      JSON.stringify([{ path: "/workspace/content/posts/keep.md", name: "keep.md" }])
    );

    globalThis.localStorage = originalStorage;
  });
});
