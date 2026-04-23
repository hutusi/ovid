import { describe, expect, test } from "bun:test";
import {
  coerceFrontmatterInput,
  isKnownFrontmatterField,
  parseBooleanFrontmatterValue,
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
    expect(isKnownFrontmatterField("unknownField")).toBe(false);
  });
});
