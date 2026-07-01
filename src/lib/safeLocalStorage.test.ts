import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { getItem, getJSON, removeItem, setItem, setJSON } from "./safeLocalStorage";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

afterEach(() => {
  localStorage.removeItem("k");
  localStorage.removeItem("bad");
  localStorage.removeItem("obj");
  localStorage.removeItem("missing");
});

describe("safeLocalStorage", () => {
  it("getItem/setItem/removeItem round-trip through real localStorage", () => {
    setItem("k", "v");
    expect(getItem("k")).toBe("v");
    removeItem("k");
    expect(getItem("k")).toBeNull();
  });

  it("getItem returns null for a missing key", () => {
    expect(getItem("missing")).toBeNull();
  });

  it("getJSON returns the fallback for a missing key", () => {
    expect(getJSON("missing", { a: 1 })).toEqual({ a: 1 });
  });

  it("getJSON returns the fallback when the stored value isn't valid JSON", () => {
    localStorage.setItem("bad", "{not json");
    expect(getJSON("bad", [] as string[])).toEqual([]);
  });

  it("setJSON/getJSON round-trip an arbitrary value", () => {
    setJSON("obj", { a: 1, b: [1, 2, 3] });
    expect(getJSON<{ a: number; b: number[] } | null>("obj", null)).toEqual({
      a: 1,
      b: [1, 2, 3],
    });
  });

  it("getItem/getJSON fall back cleanly when localStorage.getItem throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("SecurityError");
    };
    try {
      expect(getItem("k")).toBeNull();
      expect(getJSON("k", "fallback")).toBe("fallback");
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("setItem/setJSON swallow a throwing localStorage.setItem", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => setItem("k", "v")).not.toThrow();
      expect(() => setJSON("k", { a: 1 })).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
