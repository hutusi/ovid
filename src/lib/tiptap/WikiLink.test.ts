import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import markdownit from "markdown-it";
import { Markdown } from "tiptap-markdown";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { IMEComposition } from "./IMEComposition";
import { getMarkdownStorage } from "./markdownStorage";
import { registerWikiLinkMarkdownItRule, WikiLink, wikiLinkSuggestionKey } from "./WikiLink";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function makeEditor(opts: { content?: string } = {}) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ link: false }),
      IMEComposition,
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      WikiLink,
    ],
    content: opts.content ?? "<p></p>",
  });
}

function getMarkdown(editor: Editor): string {
  return getMarkdownStorage(editor).getMarkdown();
}

interface WikiLinkAttrs {
  target: string;
  displayText: string | null;
}

function firstWikiLink(editor: Editor): WikiLinkAttrs | null {
  let found: WikiLinkAttrs | null = null;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === "wikiLink") {
      found = {
        target: node.attrs.target as string,
        displayText: node.attrs.displayText as string | null,
      };
      return false;
    }
    return true;
  });
  return found;
}

// Drive a final-character keystroke through PM's handleTextInput so the input
// rule plugin fires the same way it would in the browser. Mirrors the helper
// in markdownInputRules.test.ts.
function typeAndTrigger(editor: Editor, prefix: string, lastChar: string) {
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

// ---------------------------------------------------------------------------
// Input rule
// ---------------------------------------------------------------------------

describe("WikiLink input rule", () => {
  it("schema registers a wikiLink node", () => {
    const editor = makeEditor();
    expect(editor.schema.nodes.wikiLink).toBeDefined();
    editor.destroy();
  });

  it("fires on completed `[[Hello]]`", () => {
    const editor = makeEditor();
    typeAndTrigger(editor, "[[Hello]", "]");
    const link = firstWikiLink(editor);
    expect(link).toEqual({ target: "Hello", displayText: null });
    editor.destroy();
  });

  it("parses piped `[[Target|Display]]`", () => {
    const editor = makeEditor();
    typeAndTrigger(editor, "[[Foo|bar baz]", "]");
    expect(firstWikiLink(editor)).toEqual({ target: "Foo", displayText: "bar baz" });
    editor.destroy();
  });

  it("handles CJK targets typed after CJK prose", () => {
    const editor = makeEditor();
    typeAndTrigger(editor, "前文[[你好 世界]", "]");
    expect(firstWikiLink(editor)).toEqual({ target: "你好 世界", displayText: null });
    editor.destroy();
  });

  it("does NOT fire on `[[Foo]` (unclosed)", () => {
    const editor = makeEditor();
    typeAndTrigger(editor, "[[Foo", "]");
    expect(firstWikiLink(editor)).toBeNull();
    editor.destroy();
  });

  it("does NOT fire on bare `[Foo]` (single brackets)", () => {
    const editor = makeEditor();
    typeAndTrigger(editor, "[Foo]", "]");
    expect(firstWikiLink(editor)).toBeNull();
    editor.destroy();
  });
});

// ---------------------------------------------------------------------------
// Markdown round-trip
// ---------------------------------------------------------------------------

describe("WikiLink markdown round-trip", () => {
  it("parses `[[Hello]]` from markdown into a wikiLink node", () => {
    const editor = makeEditor();
    editor.commands.setContent("Here is a [[Hello World]] reference.\n");
    const link = firstWikiLink(editor);
    expect(link).toEqual({ target: "Hello World", displayText: null });
    editor.destroy();
  });

  it("parses piped form `[[Target|Display]]`", () => {
    const editor = makeEditor();
    editor.commands.setContent("See [[Hello|hi there]] for details.\n");
    expect(firstWikiLink(editor)).toEqual({ target: "Hello", displayText: "hi there" });
    editor.destroy();
  });

  it("serializes wikiLink back to `[[…]]` markdown verbatim", () => {
    const editor = makeEditor();
    editor.commands.setContent("Read [[Foo]] and also [[Bar|see this]].\n");
    const md = getMarkdown(editor);
    expect(md).toContain("[[Foo]]");
    expect(md).toContain("[[Bar|see this]]");
    editor.destroy();
  });

  it("survives a full load→save→load cycle", () => {
    const editor1 = makeEditor();
    editor1.commands.setContent("A [[Quick One]] and a [[Long Title|short]] link.\n");
    const md1 = getMarkdown(editor1);
    editor1.destroy();

    const editor2 = makeEditor();
    editor2.commands.setContent(md1);
    const md2 = getMarkdown(editor2);
    // Re-serialization must be stable.
    expect(md2).toBe(md1);
    editor2.destroy();
  });

  it("does not mangle text inside code spans", () => {
    const editor = makeEditor();
    editor.commands.setContent("Use the `[[Foo]]` syntax to link.\n");
    // Inside a code span, `[[Foo]]` stays as literal text, so no wikiLink node.
    expect(firstWikiLink(editor)).toBeNull();
    editor.destroy();
  });
});

// ---------------------------------------------------------------------------
// Markdown-it rule registration
// ---------------------------------------------------------------------------

describe("registerWikiLinkMarkdownItRule", () => {
  it("renders `[[Foo]]` as an anchor with data-wiki-target", () => {
    const md = markdownit({ html: true });
    registerWikiLinkMarkdownItRule(md);
    const html = md.render("Hi [[Hello World]] there.");
    expect(html).toContain('data-wiki-target="Hello World"');
    expect(html).toContain(">Hello World<");
  });

  it("renders piped form with data-wiki-display", () => {
    const md = markdownit({ html: true });
    registerWikiLinkMarkdownItRule(md);
    const html = md.render("See [[Long Title|short]] please.");
    expect(html).toContain('data-wiki-target="Long Title"');
    expect(html).toContain('data-wiki-display="short"');
    expect(html).toContain(">short<");
  });

  it("escapes HTML special characters in target and display", () => {
    const md = markdownit({ html: true });
    registerWikiLinkMarkdownItRule(md);
    const html = md.render('Watch [[A<b>"&" c|x]].');
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
  });

  it("is idempotent across multiple setup calls", () => {
    const md = markdownit({ html: true });
    registerWikiLinkMarkdownItRule(md);
    registerWikiLinkMarkdownItRule(md);
    registerWikiLinkMarkdownItRule(md);
    const html = md.render("[[Foo]]");
    // Two registrations would emit two anchors; one anchor proves single-shot.
    const matches = html.match(/data-wiki-target="Foo"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("leaves `[[]]` empty body as literal text", () => {
    const md = markdownit({ html: true });
    registerWikiLinkMarkdownItRule(md);
    const html = md.render("Then [[]] nothing.");
    expect(html).not.toContain("data-wiki-target");
  });
});

// ---------------------------------------------------------------------------
// Suggestion plugin (computeWikiLinkSuggestionState)
// ---------------------------------------------------------------------------

function suggestionStateAt(editor: Editor) {
  return wikiLinkSuggestionKey.getState(editor.state);
}

// Insert text via PM transaction (no markdown parsing, no input rules) and
// place the cursor at the end so we can read the suggestion state at the
// caret position.
function typeText(editor: Editor, text: string) {
  editor.commands.focus("end");
  const tr = editor.state.tr.insertText(text, editor.state.selection.from);
  editor.view.dispatch(tr);
}

describe("WikiLink suggestion state", () => {
  it("is inactive in an empty document", () => {
    const editor = makeEditor();
    expect(suggestionStateAt(editor)).toMatchObject({ active: false, query: "" });
    editor.destroy();
  });

  it("activates after `[[` with an empty query", () => {
    const editor = makeEditor();
    typeText(editor, "[[");
    expect(suggestionStateAt(editor)).toMatchObject({ active: true, query: "" });
    editor.destroy();
  });

  it("captures the query characters typed after `[[`", () => {
    const editor = makeEditor();
    typeText(editor, "intro [[Hel");
    const state = suggestionStateAt(editor);
    expect(state).toMatchObject({ active: true, query: "Hel" });
    // `from` should mark the position of the first `[` so insertion can
    // replace `[[Hel` with a wikiLink node.
    expect(state?.to).toBe(editor.state.selection.from);
    expect((state?.to ?? 0) - (state?.from ?? 0)).toBe("[[Hel".length);
    editor.destroy();
  });

  it("deactivates once the user types `]]` (input rule consumes the brackets)", () => {
    const editor = makeEditor();
    // Note: typing `]]` via setContent triggers the markdown-it rule on load.
    editor.commands.setContent("Some [[Hello]] reference.\n");
    expect(suggestionStateAt(editor)).toMatchObject({ active: false });
    editor.destroy();
  });

  it("stays inactive across an unrelated `[[` two lines above", () => {
    const editor = makeEditor();
    editor.commands.setContent("First line has [[Foo]].\n\nSecond line.\n");
    // Caret is at the end of "Second line."; the popover should NOT trigger.
    expect(suggestionStateAt(editor)).toMatchObject({ active: false });
    editor.destroy();
  });

  it("captures CJK characters in the query", () => {
    const editor = makeEditor();
    typeText(editor, "前文 [[你好");
    expect(suggestionStateAt(editor)).toMatchObject({ active: true, query: "你好" });
    editor.destroy();
  });
});
