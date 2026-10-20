import { describe, expect, it } from "bun:test";
import { type EditorPreferences, parseEditorPreferences } from "./useEditorPreferences";

describe("parseEditorPreferences", () => {
  it("keeps valid stored values", () => {
    expect(
      parseEditorPreferences({ fontFamily: "mono", fontSize: "large", spellCheck: false })
    ).toEqual({
      fontFamily: "mono",
      fontSize: "large",
      spellCheck: false,
    });
  });

  it("falls back per field for unknown or mistyped values", () => {
    expect(
      parseEditorPreferences({ fontFamily: "comic", fontSize: 17, spellCheck: "yes" })
    ).toEqual({
      fontFamily: "serif",
      fontSize: "default",
      spellCheck: true,
    });
  });

  it("treats a non-object as no preferences", () => {
    const defaults: EditorPreferences = {
      fontFamily: "serif",
      fontSize: "default",
      spellCheck: true,
    };
    expect(parseEditorPreferences(null)).toEqual(defaults);
    expect(parseEditorPreferences("serif")).toEqual(defaults);
    expect(parseEditorPreferences(["mono"])).toEqual(defaults);
  });

  it("does not accept inherited object keys as values", () => {
    expect(parseEditorPreferences({ fontFamily: "toString" }).fontFamily).toBe("serif");
  });
});
