import { describe, expect, test } from "bun:test";
import {
  coerceCustomFrontmatterValue,
  coerceFrontmatterInput,
  getFrontmatterFieldDefaultValue,
  getFrontmatterFieldValue,
  getMissingAddableFrontmatterFields,
  inferCustomFrontmatterValueType,
  isKnownFrontmatterField,
  normalizeFrontmatterKey,
  parseBooleanFrontmatterValue,
  resolveKnownFrontmatterFieldKey,
  setFrontmatterFieldValue,
} from "./frontmatterSchema";

describe("frontmatter schema", () => {
  test("parses boolean frontmatter values", () => {
    expect(parseBooleanFrontmatterValue(true)).toBe(true);
    expect(parseBooleanFrontmatterValue(false)).toBe(false);
    expect(parseBooleanFrontmatterValue("true")).toBe(true);
    expect(parseBooleanFrontmatterValue("FALSE")).toBe(false);
    expect(parseBooleanFrontmatterValue("yes")).toBeNull();
    expect(parseBooleanFrontmatterValue(null)).toBeNull();
  });

  test("coerces known boolean input to real booleans", () => {
    expect(coerceFrontmatterInput("featured", "false")).toBe(false);
    expect(coerceFrontmatterInput("pinned", "true")).toBe(true);
    expect(coerceFrontmatterInput("featured", "")).toBe(false);
  });

  test("coerces known tag input to arrays", () => {
    expect(coerceFrontmatterInput("tags", "notes, writing")).toEqual(["notes", "writing"]);
    expect(coerceFrontmatterInput("tags", "")).toEqual([]);
  });

  test("tracks hidden known fields", () => {
    expect(isKnownFrontmatterField("type")).toBe(true);
    expect(isKnownFrontmatterField("Type")).toBe(true);
    expect(isKnownFrontmatterField("unknownField")).toBe(false);
  });

  test("returns defaults for addable known fields", () => {
    expect(getFrontmatterFieldDefaultValue("featured")).toBe(false);
    expect(getFrontmatterFieldDefaultValue("coverImage")).toBe("");
    expect(getFrontmatterFieldDefaultValue("unknownField")).toBeNull();
  });

  test("lists missing addable known fields", () => {
    expect(
      getMissingAddableFrontmatterFields({
        title: "Post",
        featured: false,
      })
    ).toEqual(["pinned", "coverImage"]);
  });

  test("treats mixed-case known keys as present for addable fields", () => {
    expect(
      getMissingAddableFrontmatterFields({
        Featured: true,
        CoverImage: "/hero.png",
      })
    ).toEqual(["pinned"]);
  });

  test("treats null-valued known keys as absent for addable fields", () => {
    expect(
      getMissingAddableFrontmatterFields({
        featured: null,
        pinned: false,
      })
    ).toEqual(["featured", "coverImage"]);
  });

  test("coerces custom metadata values by type", () => {
    expect(coerceCustomFrontmatterValue("text", " hello ")).toBe("hello");
    expect(coerceCustomFrontmatterValue("boolean", "", true)).toBe(true);
    expect(coerceCustomFrontmatterValue("number", "42")).toBe(42);
    expect(coerceCustomFrontmatterValue("number", "abc")).toBeNull();
    expect(coerceCustomFrontmatterValue("date", "2026-04-24")).toBe("2026-04-24");
    expect(coerceCustomFrontmatterValue("tags", "one, two")).toEqual(["one", "two"]);
  });

  test("normalizes and resolves frontmatter keys", () => {
    expect(normalizeFrontmatterKey(" ReadingTime ")).toBe("readingtime");
    expect(resolveKnownFrontmatterFieldKey("Featured")).toBe("featured");
    expect(resolveKnownFrontmatterFieldKey("unknown")).toBeNull();
  });

  test("reads mixed-case known field values from parsed frontmatter", () => {
    expect(getFrontmatterFieldValue({ Featured: true }, "featured")).toBe(true);
    expect(getFrontmatterFieldValue({ CoverImage: "/hero.png" }, "coverImage")).toBe("/hero.png");
  });

  test("writes known fields back using canonical schema keys", () => {
    expect(setFrontmatterFieldValue({ Featured: true }, "featured", false)).toEqual({
      featured: false,
    });
    expect(setFrontmatterFieldValue({ CoverImage: "/hero.png" }, "coverImage", null)).toEqual({
      coverImage: null,
    });
  });

  test("infers custom metadata value types from stored values", () => {
    expect(inferCustomFrontmatterValueType(true)).toBe("boolean");
    expect(inferCustomFrontmatterValueType(12)).toBe("number");
    expect(inferCustomFrontmatterValueType(["one"])).toBe("tags");
    expect(inferCustomFrontmatterValueType("2026-04-24")).toBe("date");
    expect(inferCustomFrontmatterValueType("notes")).toBe("text");
  });
});
