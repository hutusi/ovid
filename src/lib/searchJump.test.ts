import { describe, expect, it } from "bun:test";
import { frontmatterLineOffset, matchOccurrenceRank, stripLineMarkers } from "./searchJump";

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

  it("ranks with a custom normalizer so formatted duplicates map correctly", () => {
    // foo / # foo / **foo** all render to "foo"; clicking the bold result
    // (raw "**foo**", body line 2) must rank 3rd among the stripped candidates,
    // not 1st among raw "**foo**" lines.
    const lines = ["foo", "# foo", "**foo**"];
    expect(matchOccurrenceRank(lines, "**foo**", 2, stripLineMarkers)).toBe(2);
    // The heading (line 1) ranks 2nd; plain (line 0) ranks 1st.
    expect(matchOccurrenceRank(lines, "# foo", 1, stripLineMarkers)).toBe(1);
    expect(matchOccurrenceRank(lines, "foo", 0, stripLineMarkers)).toBe(0);
  });
});

describe("stripLineMarkers", () => {
  it("strips ATX heading markers", () => {
    expect(stripLineMarkers("## Target Heading")).toBe("Target Heading");
  });

  it("strips blockquote markers", () => {
    expect(stripLineMarkers("> quoted text")).toBe("quoted text");
  });

  it("strips list and task markers", () => {
    expect(stripLineMarkers("- item")).toBe("item");
    expect(stripLineMarkers("1. numbered")).toBe("numbered");
    expect(stripLineMarkers("- [ ] todo")).toBe("todo");
    expect(stripLineMarkers("* [x] done")).toBe("done");
  });

  it("strips inline emphasis and code markers", () => {
    expect(stripLineMarkers("some **bold** and `code`")).toBe("some bold and code");
    expect(stripLineMarkers("_italic_ and ~~strike~~")).toBe("italic and strike");
  });

  it("combines a heading with inline emphasis", () => {
    expect(stripLineMarkers("### The **Big** Idea")).toBe("The Big Idea");
  });

  it("returns plain lines unchanged", () => {
    expect(stripLineMarkers("just prose here")).toBe("just prose here");
  });
});
