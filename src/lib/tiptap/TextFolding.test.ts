import { describe, expect, it } from "bun:test";
import { Schema } from "prosemirror-model";
import { getHeadingRanges } from "./TextFolding";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
    },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {},
});

function h(level: number, text: string) {
  return schema.node("heading", { level }, [schema.text(text)]);
}
function p(text: string) {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}
function doc(...nodes: ReturnType<typeof h | typeof p>[]) {
  return schema.node("doc", null, nodes);
}

/** Returns the document position (before the node) of the nth top-level child. */
function childPos(d: ReturnType<typeof doc>, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += d.child(i).nodeSize;
  return pos;
}

describe("getHeadingRanges", () => {
  it("returns empty array for a doc with no headings", () => {
    expect(getHeadingRanges(doc(p("just a paragraph")))).toEqual([]);
  });

  it("returns empty array for a heading with no content after it", () => {
    // Heading at end of doc → contentFrom === contentTo (doc size), excluded
    expect(getHeadingRanges(doc(h(1, "Title")))).toEqual([]);
  });

  it("returns one range for a heading followed by paragraphs", () => {
    const d = doc(h(1, "Title"), p("paragraph one"), p("paragraph two"));
    const ranges = getHeadingRanges(d);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].level).toBe(1);
    // contentFrom is exactly headingTo (directly adjacent, no gap)
    expect(ranges[0].contentFrom).toBe(ranges[0].headingTo);
    expect(ranges[0].contentTo).toBe(d.content.size);
  });

  it("a lower-level heading ends the range of a higher-level heading", () => {
    const d = doc(h(1, "H1"), p("under h1"), h(2, "H2"), p("under h2"));
    const ranges = getHeadingRanges(d);
    expect(ranges).toHaveLength(2);

    const [h1Range, h2Range] = ranges;
    // H1 (level 1) range extends to end-of-doc because H2 (level 2) does not terminate it
    // (termination requires next heading level ≤ current level, i.e. 2 ≤ 1 is false)
    expect(h1Range.contentTo).toBe(d.content.size);

    // H2's content also runs to end of doc (nothing ≤ level 2 follows it)
    expect(h2Range.contentTo).toBe(d.content.size);
  });

  it("a same-level heading ends the previous heading's range", () => {
    const d = doc(h(1, "First"), p("para a"), h(1, "Second"), p("para b"));
    const ranges = getHeadingRanges(d);
    expect(ranges).toHaveLength(2);
    // First H1's contentTo equals Second H1's headingFrom (directly adjacent)
    expect(ranges[0].contentTo).toBe(ranges[1].headingFrom);
  });

  it("a higher-level heading does NOT end a lower-level heading's range", () => {
    // H2 followed by H1 — H2's range should still end at H1 position
    const d = doc(h(2, "Sub"), p("sub content"), h(1, "Top"), p("top content"));
    const ranges = getHeadingRanges(d);
    expect(ranges).toHaveLength(2);
    // H2's range ends at H1 (H1 has level 1 ≤ H2's level 2)
    const h1Pos = childPos(d, 2);
    expect(ranges[0].contentTo).toBe(h1Pos);
  });

  it("ranges cover the correct document positions end-to-end", () => {
    const d = doc(
      h(1, "Chapter 1"),
      p("intro"),
      h(2, "Section 1.1"),
      p("detail"),
      h(1, "Chapter 2"),
      p("outro")
    );
    const ranges = getHeadingRanges(d);
    expect(ranges).toHaveLength(3);

    // Each heading's contentTo is ≤ the next heading's headingFrom
    // (equal when they're siblings at the same level, less when parent contains child)
    for (let i = 0; i < ranges.length - 1; i++) {
      expect(ranges[i].contentTo).toBeGreaterThanOrEqual(ranges[i + 1].headingFrom);
    }
  });

  it("headingFrom and headingTo correctly bracket the heading node", () => {
    const d = doc(h(1, "My Heading"), p("body"));
    const [range] = getHeadingRanges(d);
    // headingFrom is position before the heading node (0 for the first child)
    expect(range.headingFrom).toBe(0);
    expect(range.headingTo).toBe(d.child(0).nodeSize); // heading node size
  });
});
