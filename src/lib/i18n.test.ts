import { describe, expect, it } from "bun:test";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import { FRONTMATTER_FIELD_SCHEMA } from "./frontmatterSchema";
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
  const locales = [
    { name: "en", menu: (en as Record<string, unknown>).menu as Record<string, unknown> },
    { name: "zh-CN", menu: (zhCN as Record<string, unknown>).menu as Record<string, unknown> },
  ];

  for (const { name, menu } of locales) {
    it(`every MENU_KEY has a corresponding entry in the ${name} locale`, () => {
      const missing = MENU_KEYS.filter((key) => !(key in menu));
      expect(missing).toEqual([]);
    });

    it(`every MENU_KEY resolves to a non-empty string in ${name}`, () => {
      const empty = MENU_KEYS.filter((key) => {
        const val = menu[key];
        return typeof val !== "string" || val.trim() === "";
      });
      expect(empty).toEqual([]);
    });
  }
});

describe("FRONTMATTER_FIELD_SCHEMA locale coverage", () => {
  const labelKeys = Object.values(FRONTMATTER_FIELD_SCHEMA)
    .map((field) => field.labelKey)
    .filter((labelKey): labelKey is string => typeof labelKey === "string");

  const locales = [
    { name: "en", flat: new Map<string, unknown>() },
    { name: "zh-CN", flat: new Map<string, unknown>() },
  ];
  for (const [path, value] of Object.entries(flattenLocale(en as Record<string, unknown>, ""))) {
    locales[0].flat.set(path, value);
  }
  for (const [path, value] of Object.entries(flattenLocale(zhCN as Record<string, unknown>, ""))) {
    locales[1].flat.set(path, value);
  }

  for (const { name, flat } of locales) {
    it(`every schema labelKey resolves to a non-empty string in ${name}`, () => {
      const missing = labelKeys.filter((key) => {
        const val = flat.get(key);
        return typeof val !== "string" || val.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }
});

function flattenLocale(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(acc, flattenLocale(value as Record<string, unknown>, fullKey));
    } else {
      acc[fullKey] = value;
    }
    return acc;
  }, {});
}
