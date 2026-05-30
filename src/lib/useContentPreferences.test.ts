import { describe, expect, it } from "bun:test";
import { type ContentPreferences, parseContentPreferences } from "./useContentPreferences";

const DEFAULTS: ContentPreferences = { format: "mdx", layout: "file" };

describe("parseContentPreferences", () => {
  it("returns Amytis defaults when nothing is stored", () => {
    expect(parseContentPreferences(null)).toEqual(DEFAULTS);
    expect(parseContentPreferences("")).toEqual(DEFAULTS);
  });

  it("round-trips a stored preference", () => {
    expect(parseContentPreferences(JSON.stringify({ format: "md", layout: "folder" }))).toEqual({
      format: "md",
      layout: "folder",
    });
  });

  it("falls back per-field for invalid or partial values", () => {
    expect(parseContentPreferences(JSON.stringify({ format: "rst" }))).toEqual({
      format: "mdx",
      layout: "file",
    });
    expect(parseContentPreferences(JSON.stringify({ layout: "folder" }))).toEqual({
      format: "mdx",
      layout: "folder",
    });
  });

  it("falls back to defaults on malformed JSON", () => {
    expect(parseContentPreferences("{bad json")).toEqual(DEFAULTS);
  });
});
