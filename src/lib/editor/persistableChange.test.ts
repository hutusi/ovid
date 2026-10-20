import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { FindReplace } from "../tiptap/FindReplace";
import { isPersistableUpdate, SKIP_PERSIST_META } from "./persistableChange";

const createdEditors: Editor[] = [];

/** A real editor plus a log of every `update` it emits, judged by the
 *  predicate exactly as Editor.tsx's onUpdate does. */
function makeEditor(content: string) {
  const element = document.createElement("div");
  const updates: boolean[] = [];
  const editor = new Editor({
    element,
    extensions: [StarterKit, FindReplace],
    content,
    onUpdate: ({ transaction }) => {
      updates.push(isPersistableUpdate(transaction));
    },
  });
  createdEditors.push(editor);
  return { editor, updates };
}

describe("isPersistableUpdate", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);
  afterEach(() => {
    for (const editor of createdEditors.splice(0)) editor.destroy();
  });

  it("persists typed text", () => {
    const { editor, updates } = makeEditor("<p>hello</p>");
    editor.commands.insertContentAt(1, "x");
    expect(updates).toEqual([true]);
  });

  it("persists Replace All made while the editor is not focused", () => {
    const { editor, updates } = makeEditor("<p>foo bar foo</p>");
    expect(editor.isFocused).toBe(false);
    editor.commands.setFindTerm("foo");
    editor.commands.replaceAll("baz");
    expect(editor.getText()).toBe("baz bar baz");
    expect(updates[updates.length - 1]).toBe(true);
  });

  it("persists a node-attribute change (NodeView inputs use setNodeMarkup)", () => {
    const { editor, updates } = makeEditor("<pre><code>let x = 1</code></pre><p></p>");
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { language: "typescript" }));
    expect(updates[updates.length - 1]).toBe(true);
  });

  it("does not persist a trailing-node normalization from a meta-only transaction", () => {
    // A document ending in a code block gets a paragraph appended by
    // TrailingNode on the first transaction — here a meta-only one, like the
    // IME composition flag or a mount-time selection restore. The update is
    // emitted, but merely opening such a file must not rewrite it on disk.
    const { editor, updates } = makeEditor("<pre><code>code</code></pre>");
    editor.view.dispatch(editor.state.tr.setMeta("ime/setComposing", true));
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every((persist) => persist === false)).toBe(true);
  });

  it("does not emit an update for a programmatic setContent load", () => {
    const { editor, updates } = makeEditor("<p>one</p>");
    editor.commands.setContent("<p>two</p>", { emitUpdate: false });
    expect(updates).toEqual([]);
  });

  it("honours the skip-persist meta", () => {
    const { editor, updates } = makeEditor("<p>hello</p>");
    editor.view.dispatch(editor.state.tr.insertText("x", 1).setMeta(SKIP_PERSIST_META, true));
    expect(updates).toEqual([false]);
  });
});
