import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { collectMatches, FIND_REPLACE_KEY, FindReplace } from "./FindReplace";

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

// ── FindReplace ProseMirror commands ───────────────────────────────────────
//
// Tests exercise the actual extension end-to-end via Editor.create() (the
// same pattern as ListBackspace.test.ts). No DOM is required — Tiptap runs
// commands against an in-memory editor state. Assertions hit the plugin
// state via FIND_REPLACE_KEY plus the doc text via editor.getText().

function createEditor(text: string) {
  // Tiptap doesn't install extension plugins into the EditorState until an
  // EditorView is constructed; constructing the view needs a DOM element.
  // happy-dom (registered in beforeAll) provides document; we attach to a
  // detached div which gets garbage-collected when the test ends.
  const element = document.createElement("div");
  return new Editor({
    element,
    extensions: [StarterKit, FindReplace],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
    },
  });
}

describe("FindReplace commands", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("setFindTerm populates plugin state with the match positions", () => {
    const editor = createEditor("hello hello world");
    editor.commands.setFindTerm("hello");

    const state = FIND_REPLACE_KEY.getState(editor.state);
    expect(state?.matches).toHaveLength(2);
    expect(state?.currentIndex).toBe(0);
  });

  it("setFindTerm with empty string clears matches and leaves the doc untouched", () => {
    const editor = createEditor("hello hello");
    editor.commands.setFindTerm("hello");
    expect(FIND_REPLACE_KEY.getState(editor.state)?.matches).toHaveLength(2);

    editor.commands.setFindTerm("");
    const state = FIND_REPLACE_KEY.getState(editor.state);
    expect(state?.matches).toHaveLength(0);
    expect(editor.getText()).toBe("hello hello");
  });

  it("findNext advances and wraps around at the end", () => {
    const editor = createEditor("foo bar foo baz foo");
    editor.commands.setFindTerm("foo");
    expect(FIND_REPLACE_KEY.getState(editor.state)?.currentIndex).toBe(0);

    editor.commands.findNext();
    expect(FIND_REPLACE_KEY.getState(editor.state)?.currentIndex).toBe(1);

    editor.commands.findNext();
    expect(FIND_REPLACE_KEY.getState(editor.state)?.currentIndex).toBe(2);

    editor.commands.findNext(); // wraps back to 0
    expect(FIND_REPLACE_KEY.getState(editor.state)?.currentIndex).toBe(0);
  });

  it("findPrev steps backward and wraps from 0 to the last index", () => {
    const editor = createEditor("a a a a");
    editor.commands.setFindTerm("a");
    expect(FIND_REPLACE_KEY.getState(editor.state)?.currentIndex).toBe(0);

    editor.commands.findPrev(); // wraps to last (3)
    expect(FIND_REPLACE_KEY.getState(editor.state)?.currentIndex).toBe(3);
  });

  it("replaceOne replaces the current match with the replacement text", () => {
    const editor = createEditor("hello world hello");
    editor.commands.setFindTerm("hello");
    editor.commands.replaceOne("hi");

    expect(editor.getText()).toBe("hi world hello");
  });

  it("replaceOne with empty replacement deletes the current match", () => {
    const editor = createEditor("hello world hello");
    editor.commands.setFindTerm("hello");
    editor.commands.replaceOne("");

    expect(editor.getText()).toBe(" world hello");
  });

  it("replaceAll replaces every match end-to-start (positions don't drift)", () => {
    const editor = createEditor("foo bar foo baz foo");
    editor.commands.setFindTerm("foo");
    editor.commands.replaceAll("quux");

    expect(editor.getText()).toBe("quux bar quux baz quux");
  });

  it("findNext is a no-op when there are no matches", () => {
    const editor = createEditor("hello");
    editor.commands.setFindTerm("absent");

    const before = FIND_REPLACE_KEY.getState(editor.state);
    expect(before?.matches).toHaveLength(0);

    // findNext returns false when matches is empty; the editor state stays put.
    expect(editor.commands.findNext()).toBe(false);
    const after = FIND_REPLACE_KEY.getState(editor.state);
    expect(after?.matches).toHaveLength(0);
  });
});
