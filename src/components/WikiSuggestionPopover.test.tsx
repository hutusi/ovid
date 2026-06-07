import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, render } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FlatFile } from "../lib/fileSearch";
import { IMEComposition } from "../lib/tiptap/IMEComposition";
import { WikiLink } from "../lib/tiptap/WikiLink";
import type { FileNode } from "../lib/types";

// We intentionally do NOT call `afterEach(cleanup)` from @testing-library —
// it trips a "node is not a child" error when other component tests in the
// process-wide suite have manipulated document.body in between. Each test
// destroys its editor explicitly; React/the GC reclaim the mounted roots.

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { WikiSuggestionPopover } from "./WikiSuggestionPopover";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFlat(relativePath: string, displayName?: string): FlatFile {
  const name = relativePath.split("/").pop() || relativePath;
  const node: FileNode = { name, path: `/ws/${relativePath}`, isDirectory: false };
  return { node, displayName: displayName ?? name.replace(/\.mdx?$/, ""), relativePath };
}

function makeEditor(): Editor {
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
    content: "<p></p>",
  });
}

// Drive a transaction that inserts `text` at the caret, then focus the
// editor DOM so the popover's "is the editor focused?" guard passes for
// keyboard tests. The whole sequence runs inside `act` so the React state
// updates triggered by `editor.on("transaction")` settle synchronously.
function typeRaw(editor: Editor, text: string) {
  act(() => {
    editor.commands.focus("end");
    const tr = editor.state.tr.insertText(text, editor.state.selection.from);
    editor.view.dispatch(tr);
    (editor.view.dom as HTMLElement).focus();
  });
}

function destroyEditor(editor: Editor) {
  act(() => editor.destroy());
}

const SAMPLE_NOTES: FlatFile[] = [
  makeFlat("notes/hello-world.md", "Hello World"),
  makeFlat("notes/hello-there.md", "Hello There"),
  makeFlat("notes/other.md", "Other"),
  makeFlat("flows/2026/01/02.md", "Flow"),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WikiSuggestionPopover", () => {
  it("renders nothing when there is no in-progress `[[…`", () => {
    const editor = makeEditor();
    const { container } = render(
      <WikiSuggestionPopover editor={editor} flatFiles={SAMPLE_NOTES} />
    );
    expect(container.querySelector(".wiki-suggestion-popover")).toBeNull();
    destroyEditor(editor);
  });

  it("renders ranked note suggestions when `[[query` is at the caret", () => {
    const editor = makeEditor();
    const { container } = render(
      <WikiSuggestionPopover editor={editor} flatFiles={SAMPLE_NOTES} />
    );
    typeRaw(editor, "[[Hello");
    const popover = container.querySelector(".wiki-suggestion-popover");
    expect(popover).not.toBeNull();
    // Both `Hello World` and `Hello There` match — `Other` and the flow
    // are filtered out (notes-only, score=0 for non-matches).
    const titles = Array.from(popover?.querySelectorAll(".wiki-suggestion-title") ?? []).map(
      (el) => el.textContent
    );
    expect(titles).toEqual(["Hello There", "Hello World"]);
    destroyEditor(editor);
  });

  it("only lists files in the `notes/` bucket", () => {
    const editor = makeEditor();
    const { container } = render(
      <WikiSuggestionPopover editor={editor} flatFiles={SAMPLE_NOTES} />
    );
    typeRaw(editor, "[[");
    const titles = Array.from(container.querySelectorAll(".wiki-suggestion-title")).map(
      (el) => el.textContent
    );
    // Flow is rejected by `filterNotes`; the three notes remain.
    expect(titles).not.toContain("Flow");
    expect(titles.length).toBe(3);
    destroyEditor(editor);
  });

  it("dismisses on Escape and stays dismissed for the same `[[…`", () => {
    const editor = makeEditor();
    const { container } = render(
      <WikiSuggestionPopover editor={editor} flatFiles={SAMPLE_NOTES} />
    );
    typeRaw(editor, "[[Hello");
    expect(container.querySelector(".wiki-suggestion-popover")).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector(".wiki-suggestion-popover")).toBeNull();
    // Typing another character keeps the same `[[` start position — popover
    // should NOT re-open for the same `[[…` until the user navigates away.
    typeRaw(editor, "o");
    expect(container.querySelector(".wiki-suggestion-popover")).toBeNull();
    destroyEditor(editor);
  });

  it("Enter inserts a wikiLink node replacing `[[query`", () => {
    const editor = makeEditor();
    render(<WikiSuggestionPopover editor={editor} flatFiles={SAMPLE_NOTES} />);
    typeRaw(editor, "[[Hello");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    // The first ranked match (alphabetical tiebreak when both have equal
    // prefix-match scores) is `Hello There`.
    const targets: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "wikiLink") targets.push(node.attrs.target as string);
      return true;
    });
    expect(targets[0]).toBe("Hello There");
    // The literal `[[Hello` text should no longer be in the doc.
    expect(editor.state.doc.textContent).not.toContain("[[Hello");
    destroyEditor(editor);
  });
});
