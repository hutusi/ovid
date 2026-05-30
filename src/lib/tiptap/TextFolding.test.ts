import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { FOLD_KEY, getHeadingRanges, TextFolding } from "./TextFolding";

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

  it("handles deeper heading levels when computing fold ranges", () => {
    const d = doc(
      h(3, "Section"),
      p("intro"),
      h(4, "Detail"),
      p("detail body"),
      h(6, "Fine print"),
      p("fine print body"),
      h(3, "Next section"),
      p("outro")
    );
    const ranges = getHeadingRanges(d);
    expect(ranges).toHaveLength(4);

    const nextSectionPos = childPos(d, 6);
    expect(ranges[0].level).toBe(3);
    expect(ranges[0].contentTo).toBe(nextSectionPos);
    expect(ranges[1].level).toBe(4);
    expect(ranges[1].contentTo).toBe(nextSectionPos);
    expect(ranges[2].level).toBe(6);
    expect(ranges[2].contentTo).toBe(nextSectionPos);
    expect(ranges[3].level).toBe(3);
    expect(ranges[3].contentTo).toBe(d.content.size);
  });
});

// ── TextFolding plugin state machine ───────────────────────────────────────
//
// Tests dispatch fold-toggle transactions via FOLD_KEY meta (the same path
// the chevron's mousedown handler uses internally) and assert on the
// plugin's `folded: Set<number>` state. Bypasses the DOM event surface to
// avoid happy-dom's flaky focus/event simulation; the meta is the contract.

function createEditorWithDoc(docJson: Record<string, unknown>) {
  // EditorView needs a DOM element for extension plugins to install — see
  // FindReplace.test.ts for the same rationale.
  const element = document.createElement("div");
  return new Editor({
    element,
    extensions: [StarterKit, TextFolding],
    content: docJson,
  });
}

const para = (text: string) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});

const heading = (level: 1 | 2 | 3, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const docOf = (...nodes: Record<string, unknown>[]) => ({ type: "doc", content: nodes });

function toggleFold(editor: Editor, headingPos: number) {
  editor.view.dispatch(
    editor.state.tr.setMeta(FOLD_KEY, { togglePos: headingPos }).setMeta("addToHistory", false)
  );
}

function getFoldedSet(editor: Editor): ReadonlySet<number> {
  return FOLD_KEY.getState(editor.state)?.folded ?? new Set<number>();
}

describe("TextFolding fold state machine", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("starts with an empty folded set", () => {
    const editor = createEditorWithDoc(docOf(heading(1, "Title"), para("body")));
    expect(getFoldedSet(editor).size).toBe(0);
  });

  it("toggling a heading position adds it to the folded set", () => {
    const editor = createEditorWithDoc(docOf(heading(1, "Title"), para("body")));
    const [range] = getHeadingRanges(editor.state.doc);
    expect(range).toBeDefined();

    toggleFold(editor, range.headingFrom);

    const folded = getFoldedSet(editor);
    expect(folded.has(range.headingFrom)).toBe(true);
    expect(folded.size).toBe(1);
  });

  it("toggling the same position twice removes it from the folded set", () => {
    const editor = createEditorWithDoc(docOf(heading(1, "Title"), para("body")));
    const [range] = getHeadingRanges(editor.state.doc);

    toggleFold(editor, range.headingFrom);
    expect(getFoldedSet(editor).size).toBe(1);

    toggleFold(editor, range.headingFrom);
    expect(getFoldedSet(editor).size).toBe(0);
  });

  it("folding two sibling headings independently keeps both in the set", () => {
    const editor = createEditorWithDoc(
      docOf(heading(1, "First"), para("a"), heading(1, "Second"), para("b"))
    );
    const ranges = getHeadingRanges(editor.state.doc);
    expect(ranges).toHaveLength(2);

    toggleFold(editor, ranges[0].headingFrom);
    toggleFold(editor, ranges[1].headingFrom);

    const folded = getFoldedSet(editor);
    expect(folded.size).toBe(2);
    expect(folded.has(ranges[0].headingFrom)).toBe(true);
    expect(folded.has(ranges[1].headingFrom)).toBe(true);
  });

  it("folded positions are kept in sync through document edits via mapping", () => {
    // After a non-folded-position doc change, the folded set should remap
    // its positions to track moved headings (per the apply()'s mapping branch).
    const editor = createEditorWithDoc(
      docOf(para("intro paragraph"), heading(1, "H"), para("body"))
    );
    const headingPos = getHeadingRanges(editor.state.doc)[0]?.headingFrom;
    expect(headingPos).toBeDefined();

    toggleFold(editor, headingPos as number);
    expect(getFoldedSet(editor).has(headingPos as number)).toBe(true);

    // Insert text at position 1 (inside the intro paragraph). The heading
    // shifts right by the inserted length, and the folded set should follow.
    const insertText = "X";
    editor.view.dispatch(editor.state.tr.insertText(insertText, 1));

    const newHeadingPos = getHeadingRanges(editor.state.doc)[0]?.headingFrom;
    expect(newHeadingPos).toBeDefined();
    expect(newHeadingPos).not.toBe(headingPos);
    // The fold state should now point at the new heading position.
    expect(getFoldedSet(editor).has(newHeadingPos as number)).toBe(true);
  });
});
