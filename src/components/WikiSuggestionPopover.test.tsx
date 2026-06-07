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
import type { NoteResolverIndex } from "../lib/wikiLink";

// We intentionally do NOT call `afterEach(cleanup)` from @testing-library —
// it trips a "node is not a child" error when other component tests in the
// process-wide suite have manipulated document.body in between. Each test
// owns its teardown via `setup()` below, which calls the `render` result's
// `unmount()` alongside `editor.destroy()` so the popover's capture-phase
// `document.keydown` listener doesn't leak across tests.

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

function makeFlat(relativePath: string, title?: string): FlatFile {
  const name = relativePath.split("/").pop() || relativePath;
  const node: FileNode = { name, path: `/ws/${relativePath}`, isDirectory: false, title };
  return { node, displayName: title ?? name.replace(/\.mdx?$/, ""), relativePath };
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

const SAMPLE_NOTES: FlatFile[] = [
  makeFlat("notes/hello-world.md", "Hello World"),
  makeFlat("notes/hello-there.md", "Hello There"),
  makeFlat("notes/other.md", "Other"),
  makeFlat("flows/2026/01/02.md", "Flow"),
];

/** Build a resolver index that mirrors what `buildNoteResolverIndex` would
 *  produce for `SAMPLE_NOTES` — every notes-bucket entry has a `title`,
 *  no aliases. Notes without a resolver handle are excluded from the popover
 *  by `hasResolverHandle`, so tests need each suggestion to be indexable. */
function makeResolverIndex(extras: Partial<NoteResolverIndex> = {}): NoteResolverIndex {
  return {
    byPath: new Map([
      ["notes/hello-world.md", { title: "Hello World" }],
      ["notes/hello-there.md", { title: "Hello There" }],
      ["notes/other.md", { title: "Other" }],
    ]),
    byTitle: new Map([
      ["hello world", "notes/hello-world.md"],
      ["hello there", "notes/hello-there.md"],
      ["other", "notes/other.md"],
    ]),
    byAlias: new Map(),
    ...extras,
  };
}

interface PopoverHarness {
  editor: Editor;
  container: HTMLElement;
  teardown: () => void;
}

/** Mount the popover against a fresh editor and return a single `teardown`
 *  closure that unmounts the React tree AND destroys the editor. Calling
 *  both is necessary: `editor.destroy()` doesn't unmount the React tree,
 *  so without `unmount()` the popover's capture-phase `document.keydown`
 *  listener would survive past the test and break ordering for later
 *  cases. */
function setup(
  args: { flatFiles?: FlatFile[]; resolverIndex?: NoteResolverIndex } = {}
): PopoverHarness {
  const editor = makeEditor();
  const flatFiles = args.flatFiles ?? SAMPLE_NOTES;
  const resolverIndex = args.resolverIndex ?? makeResolverIndex();
  const result = render(
    <WikiSuggestionPopover editor={editor} flatFiles={flatFiles} resolverIndex={resolverIndex} />
  );
  return {
    editor,
    container: result.container,
    teardown: () => {
      act(() => {
        result.unmount();
        editor.destroy();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WikiSuggestionPopover", () => {
  it("renders nothing when there is no in-progress `[[…`", () => {
    const { container, teardown } = setup();
    expect(container.querySelector(".wiki-suggestion-popover")).toBeNull();
    teardown();
  });

  it("renders ranked note suggestions when `[[query` is at the caret", () => {
    const { editor, container, teardown } = setup();
    typeRaw(editor, "[[Hello");
    const popover = container.querySelector(".wiki-suggestion-popover");
    expect(popover).not.toBeNull();
    // Both `Hello World` and `Hello There` match — `Other` and the flow
    // are filtered out (notes-only, score=0 for non-matches).
    const titles = Array.from(popover?.querySelectorAll(".wiki-suggestion-title") ?? []).map(
      (el) => el.textContent
    );
    expect(titles).toEqual(["Hello There", "Hello World"]);
    teardown();
  });

  it("only lists files in the `notes/` bucket", () => {
    const { editor, container, teardown } = setup();
    typeRaw(editor, "[[");
    const titles = Array.from(container.querySelectorAll(".wiki-suggestion-title")).map(
      (el) => el.textContent
    );
    // Flow is rejected by `filterNotes`; the three resolvable notes remain.
    expect(titles).not.toContain("Flow");
    expect(titles.length).toBe(3);
    teardown();
  });

  it("hides notes that have no frontmatter `title:` or alias", () => {
    // A note without a resolver handle (no title, no aliases) would write a
    // `[[stem]]` target the resolver can never round-trip. Filter those out.
    const flatFiles = [makeFlat("notes/titled.md", "Titled Note"), makeFlat("notes/no-title.md")];
    const resolverIndex: NoteResolverIndex = {
      byPath: new Map([
        ["notes/titled.md", { title: "Titled Note" }],
        ["notes/no-title.md", {}],
      ]),
      byTitle: new Map([["titled note", "notes/titled.md"]]),
      byAlias: new Map(),
    };
    const { editor, container, teardown } = setup({ flatFiles, resolverIndex });
    typeRaw(editor, "[[");
    const titles = Array.from(container.querySelectorAll(".wiki-suggestion-title")).map(
      (el) => el.textContent
    );
    expect(titles).toEqual(["Titled Note"]);
    teardown();
  });

  it("dismisses on Escape and stays dismissed for the same `[[…`", () => {
    const { editor, container, teardown } = setup();
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
    teardown();
  });

  it("Enter inserts a wikiLink node using the resolver-friendly target", () => {
    const { editor, teardown } = setup();
    typeRaw(editor, "[[Hello");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    // The first ranked match (alphabetical tiebreak when both have equal
    // prefix-match scores) is `Hello There`. The inserted target should be
    // the note's frontmatter title — same key the resolver's `byTitle` uses.
    const targets: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "wikiLink") targets.push(node.attrs.target as string);
      return true;
    });
    expect(targets[0]).toBe("Hello There");
    // The literal `[[Hello` text should no longer be in the doc.
    expect(editor.state.doc.textContent).not.toContain("[[Hello");
    teardown();
  });

  it("prefers the first alias over the title when both are present", () => {
    const flatFiles = [makeFlat("notes/hello.md", "Hello World")];
    const resolverIndex: NoteResolverIndex = {
      byPath: new Map([["notes/hello.md", { title: "Hello World", aliases: ["hi", "yo"] }]]),
      byTitle: new Map([["hello world", "notes/hello.md"]]),
      byAlias: new Map([
        ["hi", "notes/hello.md"],
        ["yo", "notes/hello.md"],
      ]),
    };
    const { editor, teardown } = setup({ flatFiles, resolverIndex });
    typeRaw(editor, "[[Hello");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const targets: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "wikiLink") targets.push(node.attrs.target as string);
      return true;
    });
    // Resolver lookup order is alias → title, so the inserted target picks
    // the first alias to match.
    expect(targets[0]).toBe("hi");
    teardown();
  });
});
