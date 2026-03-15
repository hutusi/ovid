import { describe, expect, it } from "bun:test";
import { Schema } from "prosemirror-model";
import { collectMatches } from "./FindReplace";

// Minimal schema: doc > paragraph > text
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {},
});

function doc(...paragraphs: string[]) {
  return schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : []))
  );
}

describe("collectMatches", () => {
  it("returns empty array for empty search term", () => {
    expect(collectMatches(doc("hello world"), "")).toEqual([]);
  });

  it("returns empty array when term not found", () => {
    expect(collectMatches(doc("hello world"), "xyz")).toEqual([]);
  });

  it("finds a single match in one paragraph", () => {
    const matches = collectMatches(doc("hello world"), "world");
    expect(matches).toHaveLength(1);
    expect(matches[0].to - matches[0].from).toBe(5); // "world" is 5 chars
  });

  it("finds multiple matches in one paragraph", () => {
    const matches = collectMatches(doc("foo bar foo baz foo"), "foo");
    expect(matches).toHaveLength(3);
  });

  it("is case-insensitive", () => {
    const matches = collectMatches(doc("Hello HELLO hello"), "hello");
    expect(matches).toHaveLength(3);
  });

  it("finds matches across multiple paragraphs", () => {
    const matches = collectMatches(doc("first match here", "second match here"), "match");
    expect(matches).toHaveLength(2);
  });

  it("escapes regex special characters in the term", () => {
    // If '$' were treated as a regex anchor it would find 0 or unexpected matches
    const matches = collectMatches(doc("price is $10.00 or $20"), "$");
    expect(matches).toHaveLength(2);
  });

  it("escapes dot in search term", () => {
    const matches = collectMatches(doc("v1.0 and v1x0"), "1.0");
    // Only literal "1.0" should match, not "1x0"
    expect(matches).toHaveLength(1);
  });

  it("returns correct positions — from and to are consistent", () => {
    const d = doc("abcXYZdef");
    const matches = collectMatches(d, "XYZ");
    expect(matches).toHaveLength(1);
    const [m] = matches;
    expect(m.to - m.from).toBe(3);
    // The text node is inside a paragraph node, so positions are offset
    // Verify the matched slice contains the expected text
    expect(d.textBetween(m.from, m.to)).toBe("XYZ");
  });

  it("returns correct positions for matches in second paragraph", () => {
    const d = doc("first paragraph", "second TARGET here");
    const matches = collectMatches(d, "TARGET");
    expect(matches).toHaveLength(1);
    expect(d.textBetween(matches[0].from, matches[0].to)).toBe("TARGET");
  });

  it("handles empty paragraph gracefully", () => {
    const matches = collectMatches(doc("", "hello", ""), "hello");
    expect(matches).toHaveLength(1);
  });

  it("finds adjacent non-overlapping matches", () => {
    const matches = collectMatches(doc("aa aa aa"), "aa");
    expect(matches).toHaveLength(3);
    // Ensure no overlaps
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].from).toBeGreaterThanOrEqual(matches[i - 1].to);
    }
  });
});
