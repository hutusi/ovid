import { describe, expect, it } from "bun:test";
import { deriveDisplayNameFromUrl } from "./WorkspaceSwitcher";

describe("deriveDisplayNameFromUrl", () => {
  it("strips a trailing .git suffix from an https URL", () => {
    expect(deriveDisplayNameFromUrl("https://github.com/foo/bar.git")).toBe("bar");
  });

  it("handles URLs without a .git suffix", () => {
    expect(deriveDisplayNameFromUrl("https://github.com/foo/bar")).toBe("bar");
  });

  it("strips trailing slashes before taking the last segment", () => {
    expect(deriveDisplayNameFromUrl("https://github.com/foo/bar/")).toBe("bar");
  });

  it("handles scp-style ssh URLs", () => {
    expect(deriveDisplayNameFromUrl("git@github.com:foo/bar.git")).toBe("bar");
  });

  it("returns null for an empty input", () => {
    expect(deriveDisplayNameFromUrl("")).toBeNull();
    expect(deriveDisplayNameFromUrl("   ")).toBeNull();
  });
});
