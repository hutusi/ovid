import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { useRecentWorkspaces } from "./useRecentWorkspaces";

const STORAGE_KEY = "ovid:recentWorkspaces";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

beforeEach(() => {
  // Each test starts with a clean storage so we don't carry recents across.
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe("useRecentWorkspaces.removeRecentWorkspace", () => {
  it("drops the matching rootPath and persists the new list to localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { rootPath: "/a", name: "a", lastOpenedAt: 1 },
        { rootPath: "/b", name: "b", lastOpenedAt: 2 },
      ])
    );

    const { result } = renderHook(() => useRecentWorkspaces());
    expect(result.current.recentWorkspaces.map((w) => w.rootPath)).toEqual(["/a", "/b"]);

    act(() => {
      result.current.removeRecentWorkspace("/a");
    });

    expect(result.current.recentWorkspaces.map((w) => w.rootPath)).toEqual(["/b"]);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].rootPath).toBe("/b");
  });

  it("is a no-op when the rootPath is not in the list", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ rootPath: "/a", name: "a", lastOpenedAt: 1 }])
    );

    const { result } = renderHook(() => useRecentWorkspaces());
    const before = result.current.recentWorkspaces;

    act(() => {
      result.current.removeRecentWorkspace("/nope");
    });

    // Same array reference is returned when nothing changes — this is what
    // lets React skip the re-render and keeps callers stable across removes
    // they didn't actually match.
    expect(result.current.recentWorkspaces).toBe(before);
  });
});
