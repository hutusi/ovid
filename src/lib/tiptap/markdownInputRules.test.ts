import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor, InputRule } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { IMEComposition } from "./IMEComposition";
import { InlineEditMode } from "./InlineEditMode";
import { BoldWithMarkdownShortcut, ItalicWithMarkdownShortcut } from "./markdownInputRules";

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
      BoldWithMarkdownShortcut,
      ItalicWithMarkdownShortcut,
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Typography,
      Link.extend({
        addInputRules() {
          return [
            new InputRule({
              find: /\[([^[\]]+)\]\(([^()]+)\)$/,
              handler: ({ range, match, commands }) => {
                const [, text, href] = match;
                commands.insertContentAt(range, [
                  {
                    type: "text",
                    text,
                    marks: [{ type: "link", attrs: { href, rel: "noopener noreferrer" } }],
                  },
                ]);
              },
            }),
          ];
        },
      }).configure({ openOnClick: false }),
      InlineEditMode,
    ],
    content: "<p></p>",
  });
}

function hasMark(editor: Editor, text: string, markName: string): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false; // short-circuit traversal once we've answered
    if (node.isText && node.text === text && node.marks.some((m) => m.type.name === markName)) {
      found = true;
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
  //    plugin (PM's normal dispatch path during typing). `someProp` returns
  //    the first truthy result — for inputRulesPlugin that's `true` iff a
  //    rule matched and dispatched. The 5th `deflt` arg is required by the
  //    PM type signature but Tiptap's inputRulesPlugin never invokes it.
  const from = editor.state.selection.from;
  const noopDeflt = () => editor.state.tr;
  const handled = editor.view.someProp("handleTextInput", (handler) =>
    handler(editor.view, from, from, lastChar, noopDeflt)
  );

  // 3. If no input rule consumed the keystroke, insert it ourselves so the
  //    document accurately reflects what the user typed (matters for the
  //    "rule must NOT fire" negative-path tests).
  if (!handled) {
    editor.view.dispatch(editor.state.tr.insertText(lastChar, from, from));
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

function linkHref(editor: Editor, text: string): string | null {
  let href: string | null = null;
  editor.state.doc.descendants((node) => {
    if (href !== null) return false; // first match wins, stop traversal
    if (node.isText && node.text === text) {
      const linkMark = node.marks.find((m) => m.type.name === "link");
      if (linkMark) href = (linkMark.attrs.href as string) ?? null;
    }
  });
  return href;
}

describe("link input rule diagnostics", () => {
  it("schema contains link mark", () => {
    const editor = makeEditor();
    expect(editor.schema.marks.link).toBeDefined();
    editor.destroy();
  });

  it("fires for [text](url) — text becomes a link, syntax chars removed", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "[Tiptap](https://tiptap.dev", ")");
    expect(linkHref(editor, "Tiptap")).toBe("https://tiptap.dev");
    // Square brackets and parens must not survive — the rule replaces the
    // matched range with a single linked text node.
    const allText = editor.state.doc.textBetween(0, editor.state.doc.content.size);
    expect(allText).not.toContain("[");
    expect(allText).not.toContain("(");
    editor.destroy();
  });

  it("preserves surrounding text", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "see [docs](https://example.com", ")");
    expect(linkHref(editor, "docs")).toBe("https://example.com");
    const allText = editor.state.doc.textBetween(0, editor.state.doc.content.size);
    expect(allText.startsWith("see ")).toBe(true);
    editor.destroy();
  });
});
