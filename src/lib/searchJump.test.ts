import { describe, expect, it } from "bun:test";
import { frontmatterLineOffset, matchOccurrenceRank } from "./searchJump";

describe("frontmatterLineOffset", () => {
  it("counts the lines a frontmatter block occupies", () => {
    // ---\ntitle: X\n---\n  → the body starts on file line 4 (index 3).
    const raw = "---\ntitle: X\n---\nbody line\n";
    expect(frontmatterLineOffset(raw)).toBe(3);
  });

  it("is zero when there is no frontmatter", () => {
    expect(frontmatterLineOffset("just body\nmore\n")).toBe(0);
  });
});

describe("matchOccurrenceRank", () => {
  const body = ["alpha", "todo", "beta", "todo", "gamma", "todo"];

  it("returns 0 for a unique line", () => {
    expect(matchOccurrenceRank(body, "beta", 2)).toBe(0);
  });

  it("picks the occurrence nearest the target line among duplicates", () => {
    // "todo" appears at body lines 1, 3, 5 (ranks 0, 1, 2).
    expect(matchOccurrenceRank(body, "todo", 1)).toBe(0);
    expect(matchOccurrenceRank(body, "todo", 3)).toBe(1);
    expect(matchOccurrenceRank(body, "todo", 5)).toBe(2);
    // Equidistant (line 4 is 1 away from both line 3 and line 5): the earlier
    // occurrence wins the tie.
    expect(matchOccurrenceRank(body, "todo", 4)).toBe(1);
  });

  it("matches on trimmed content", () => {
    expect(matchOccurrenceRank(["  todo  ", "x", "todo"], "todo", 2)).toBe(1);
  });

  it("returns 0 when nothing matches (caller falls back)", () => {
    expect(matchOccurrenceRank(body, "missing", 3)).toBe(0);
  });
});
