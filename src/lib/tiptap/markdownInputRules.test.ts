import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor, markInputRule } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { IMEComposition } from "./IMEComposition";
import { InlineEditMode } from "./InlineEditMode";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function makeEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        bold: false,
        italic: false,
      }),
      IMEComposition,
      Bold.extend({
        addInputRules() {
          return [
            markInputRule({
              find: /(\*\*(?!\s+\*\*)([^*]+)\*\*(?!\s+\*\*))$/,
              type: this.type,
            }),
            markInputRule({
              find: /(__(?!\s+__)([^_]+)__(?!\s+__))$/,
              type: this.type,
            }),
          ];
        },
      }),
      Italic.extend({
        addInputRules() {
          return [
            markInputRule({
              find: /(?<!\*)\*(?!\*)([^*\s][^*]*?)\*(?!\*)$/,
              type: this.type,
            }),
            markInputRule({
              find: /(?<!_)_(?!_)([^_\s][^_]*?)_(?!_)$/,
              type: this.type,
            }),
          ];
        },
      }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Typography,
      Link.configure({ openOnClick: false }),
      InlineEditMode,
    ],
    content: "<p></p>",
  });
}

function hasMark(editor: Editor, text: string, markName: string): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text === text) {
      found = node.marks.some((m) => m.type.name === markName);
    }
  });
  return found;
}

// Seed the editor with `prefix` characters and then simulate typing `lastChar`
// at the cursor. This goes through ProseMirror's input-rule handleTextInput
// path — the same path real keystrokes hit — bypassing tiptap-markdown's
// insertContent / insertContentAt overrides that would parse the whole string
// as markdown and short-circuit the test.
function typeAndTriggerRule(editor: Editor, prefix: string, lastChar: string) {
  // 1. Insert the prefix as raw text (no markdown parsing).
  const tr = editor.state.tr;
  tr.insertText(prefix, editor.state.selection.from);
  editor.view.dispatch(tr);

  // 2. Simulate the final keystroke by invoking handleTextInput on every
  //    plugin (PM's normal dispatch path during typing).
  const from = editor.state.selection.from;
  const deflt = () => editor.state.tr.insertText(lastChar, from, from);
  editor.view.someProp("handleTextInput", (handler) =>
    handler(editor.view, from, from, lastChar, deflt)
  );

  // 3. If no input rule consumed the keystroke, insert it ourselves so the
  //    document still reflects what the user typed (useful for negative cases).
  if (
    editor.state.doc.textBetween(0, editor.state.doc.content.size).indexOf(prefix + lastChar) === -1
  ) {
    // Rule consumed and transformed the text — that's the success case.
    return;
  }
}

describe("bold input rule diagnostics", () => {
  it("schema contains bold mark (registration sanity check)", () => {
    const editor = makeEditor();
    expect(editor.schema.marks.bold).toBeDefined();
    editor.destroy();
  });

  it("fires for **word** at start of paragraph", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "**word*", "*");
    expect(hasMark(editor, "word", "bold")).toBe(true);
    editor.destroy();
  });

  it("fires for **word** after CJK text", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "测试**word*", "*");
    expect(hasMark(editor, "word", "bold")).toBe(true);
    editor.destroy();
  });

  it("fires for __word__ underscore form", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "__word_", "_");
    expect(hasMark(editor, "word", "bold")).toBe(true);
    editor.destroy();
  });
});

describe("italic input rule diagnostics", () => {
  it("schema contains italic mark", () => {
    const editor = makeEditor();
    expect(editor.schema.marks.italic).toBeDefined();
    editor.destroy();
  });

  it("fires for *word* at start of paragraph", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "*word", "*");
    expect(hasMark(editor, "word", "italic")).toBe(true);
    editor.destroy();
  });

  it("fires for *word* after CJK text", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "测试*word", "*");
    expect(hasMark(editor, "word", "italic")).toBe(true);
    editor.destroy();
  });

  it("fires for _word_ underscore form", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "_word", "_");
    expect(hasMark(editor, "word", "italic")).toBe(true);
    editor.destroy();
  });

  it("does NOT fire mid-bold typing (no italic inside **word**)", () => {
    const editor = makeEditor();
    // Type `**word*` — italic must not fire on this intermediate state.
    typeAndTriggerRule(editor, "**word", "*");
    expect(hasMark(editor, "word", "italic")).toBe(false);
    editor.destroy();
  });

  it("**word** still produces bold-only, not italic-inside-bold", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "**word*", "*");
    expect(hasMark(editor, "word", "bold")).toBe(true);
    expect(hasMark(editor, "word", "italic")).toBe(false);
    editor.destroy();
  });
});
