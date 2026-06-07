import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor, InputRule } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { IMEComposition } from "./IMEComposition";
import { ImageRenderer } from "./ImageRenderer";
import { BoldWithMarkdownShortcut, ItalicWithMarkdownShortcut } from "./markdownInputRules";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

// Mirrors the production extension list closely enough to exercise the
// image rule vs. the link rule. Keep this in sync with Editor.tsx's Link
// configuration so the (?<!!) lookbehind is actually under test.
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
              find: /(?<!!)\[([^[\]]+)\]\(([^()]+)\)$/,
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
      ImageRenderer,
    ],
    content: "<p></p>",
  });
}

function findImage(editor: Editor): { src: string; alt: string | null } | null {
  let found: { src: string; alt: string | null } | null = null;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === "image") {
      found = {
        src: (node.attrs.src as string) ?? "",
        alt: (node.attrs.alt as string) ?? null,
      };
    }
  });
  return found;
}

function hasLink(editor: Editor, text: string): string | null {
  let href: string | null = null;
  editor.state.doc.descendants((node) => {
    if (href !== null) return false;
    if (node.isText && node.text === text) {
      const linkMark = node.marks.find((m) => m.type.name === "link");
      if (linkMark) href = (linkMark.attrs.href as string) ?? null;
    }
  });
  return href;
}

// Same drive-through-handleTextInput pattern as markdownInputRules.test.ts —
// dispatches the final keystroke through ProseMirror's input-rule plugin so
// the rule actually fires (insertContent path would short-circuit via
// tiptap-markdown parsing).
function typeAndTriggerRule(editor: Editor, prefix: string, lastChar: string) {
  const tr = editor.state.tr;
  tr.insertText(prefix, editor.state.selection.from);
  editor.view.dispatch(tr);

  const from = editor.state.selection.from;
  const noopDeflt = () => editor.state.tr;
  const handled = editor.view.someProp("handleTextInput", (handler) =>
    handler(editor.view, from, from, lastChar, noopDeflt)
  );

  if (!handled) {
    editor.view.dispatch(editor.state.tr.insertText(lastChar, from, from));
  }
}

describe("image input rule", () => {
  it("schema contains image node", () => {
    const editor = makeEditor();
    expect(editor.schema.nodes.image).toBeDefined();
    editor.destroy();
  });

  it("fires for ![alt](src) at start of paragraph", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "![cat](https://example.com/cat.png", ")");
    const img = findImage(editor);
    expect(img).not.toBeNull();
    expect(img?.src).toBe("https://example.com/cat.png");
    expect(img?.alt).toBe("cat");
    editor.destroy();
  });

  it("fires after CJK text (regression: stock rule requires whitespace)", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "你好![中文](https://example.com/x.png", ")");
    const img = findImage(editor);
    expect(img).not.toBeNull();
    expect(img?.src).toBe("https://example.com/x.png");
    expect(img?.alt).toBe("中文");
    editor.destroy();
  });

  it("accepts empty alt text — ![](src)", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "![](https://example.com/x.png", ")");
    const img = findImage(editor);
    expect(img).not.toBeNull();
    expect(img?.src).toBe("https://example.com/x.png");
    expect(img?.alt).toBe("");
    editor.destroy();
  });

  it("does NOT degrade into a link with stray !", () => {
    // Reproduces the reported bug: before the fix, the Link rule matched
    // `[image](image-url)` inside `![image](image-url)`, leaving `!` as text.
    const editor = makeEditor();
    typeAndTriggerRule(editor, "![image](image-url", ")");
    expect(findImage(editor)).not.toBeNull();
    expect(hasLink(editor, "image")).toBeNull();
    const allText = editor.state.doc.textBetween(0, editor.state.doc.content.size);
    expect(allText).not.toContain("!");
    editor.destroy();
  });
});

describe("link input rule (?<!!) lookbehind", () => {
  it("plain [text](url) still becomes a link", () => {
    const editor = makeEditor();
    typeAndTriggerRule(editor, "[Tiptap](https://tiptap.dev", ")");
    expect(hasLink(editor, "Tiptap")).toBe("https://tiptap.dev");
    expect(findImage(editor)).toBeNull();
    editor.destroy();
  });

  it("link rule does not cannibalise image syntax", () => {
    // Direct check on the lookbehind: even if the image rule hypothetically
    // failed to register, the link rule must not eat `[image](image-url)`
    // out of `![image](image-url)`.
    const editor = makeEditor();
    typeAndTriggerRule(editor, "![label](https://example.com", ")");
    expect(hasLink(editor, "label")).toBeNull();
    editor.destroy();
  });
});

describe("image markdown round-trip", () => {
  it("loaded markdown ![alt](src) serializes back to ![alt](src)", () => {
    const editor = makeEditor();
    editor.commands.setContent("![cat](https://example.com/cat.png)");
    const img = findImage(editor);
    expect(img?.src).toBe("https://example.com/cat.png");
    expect(img?.alt).toBe("cat");

    // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown's storage shape isn't in the public Storage type
    const md = (editor.storage as any).markdown.getMarkdown() as string;
    expect(md).toContain("![cat](https://example.com/cat.png)");
    editor.destroy();
  });

  it("preserves empty alt round-trip", () => {
    const editor = makeEditor();
    editor.commands.setContent("![](https://example.com/x.png)");
    // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown's storage shape isn't in the public Storage type
    const md = (editor.storage as any).markdown.getMarkdown() as string;
    expect(md).toContain("![](https://example.com/x.png)");
    editor.destroy();
  });
});
