import { describe, expect, it } from "bun:test";
import { parseAppPreferences } from "./useAppPreferences";

describe("parseAppPreferences", () => {
  it("defaults restoreLastSession to true when nothing is stored", () => {
    expect(parseAppPreferences(null)).toEqual({ restoreLastSession: true });
    expect(parseAppPreferences("")).toEqual({ restoreLastSession: true });
  });

  it("round-trips a stored boolean", () => {
    expect(parseAppPreferences(JSON.stringify({ restoreLastSession: false }))).toEqual({
      restoreLastSession: false,
    });
  });

  it("falls back to the default for non-boolean or malformed values", () => {
    expect(parseAppPreferences(JSON.stringify({ restoreLastSession: "no" }))).toEqual({
      restoreLastSession: true,
    });
    expect(parseAppPreferences("{bad json")).toEqual({ restoreLastSession: true });
  });
});
