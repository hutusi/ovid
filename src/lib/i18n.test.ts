import { describe, expect, it } from "bun:test";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import { MENU_KEYS } from "./menuLabels";

// Recursively collect every leaf key path from a nested object.
// e.g. { a: { b: "v" } } → ["a.b"]
function collectLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return collectLeafKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

describe("locale key parity", () => {
  const enKeys = new Set(collectLeafKeys(en as Record<string, unknown>));
  const zhKeys = new Set(collectLeafKeys(zhCN as Record<string, unknown>));

  it("zh-CN has no keys missing from en", () => {
    const missing = [...enKeys].filter((k) => !zhKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("zh-CN has no extra keys not present in en", () => {
    const extra = [...zhKeys].filter((k) => !enKeys.has(k));
    expect(extra).toEqual([]);
  });
});

describe("MENU_KEYS locale coverage", () => {
  const menuSection = (en as Record<string, unknown>).menu as Record<string, unknown>;

  it("every MENU_KEY has a corresponding entry in the en locale", () => {
    const missing = MENU_KEYS.filter((key) => !(key in menuSection));
    expect(missing).toEqual([]);
  });

  it("every MENU_KEY resolves to a non-empty string in en", () => {
    const empty = MENU_KEYS.filter((key) => {
      const val = menuSection[key];
      return typeof val !== "string" || val.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
