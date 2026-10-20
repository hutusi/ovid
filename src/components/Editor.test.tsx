import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, type RenderResult, render } from "@testing-library/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: localT,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

// The editor command table listens for native menu events; there is no Tauri
// runtime under test.
mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

// Register the DOM before Editor (and Tiptap) load, so useEditor sees a
// browser environment and renders immediately instead of assuming SSR.
let Editor: typeof import("./Editor").Editor;
beforeAll(async () => {
  registerHappyDom();
  ({ Editor } = await import("./Editor"));
});
afterAll(unregisterHappyDom);

// Unmount only what this file rendered — not `cleanup` from @testing-library,
// whose process-wide registry trips over other component tests' containers
// (see WikiLinkView.test.tsx).
const mounted: RenderResult[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) act(() => view.unmount());
});

// The serialize debounce is 150 ms and the view-state restore schedule runs to
// ~320 ms; wait comfortably past both.
const SETTLE_MS = 400;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tiptap exposes the editor instance on its ProseMirror root. */
function tiptapOf(container: HTMLElement): TiptapEditor {
  const dom = container.querySelector(".ProseMirror") as
    | (HTMLElement & {
        editor?: TiptapEditor;
      })
    | null;
  if (!dom?.editor) throw new Error("editor not mounted");
  return dom.editor;
}

function renderEditor(props: { content: string; loadId: number }) {
  const onChange = mock((_markdown: string) => {});
  const onDirty = mock(() => {});
  const onWordCount = mock(
    (_count: number, _path?: string, _kind?: "open" | "reload" | "typing") => {}
  );
  const view = render(
    <Editor
      {...props}
      filePath="/ws/note.md"
      onChange={onChange}
      onDirty={onDirty}
      onWordCount={onWordCount}
    />
  );
  mounted.push(view);
  const rerender = (next: { content: string; loadId: number }) =>
    view.rerender(
      <Editor
        {...next}
        filePath="/ws/note.md"
        onChange={onChange}
        onDirty={onDirty}
        onWordCount={onWordCount}
      />
    );
  return { view, rerender, onChange, onDirty, onWordCount };
}

describe("Editor — applying loads", () => {
  it("a reload to text identical to the previous load still replaces the edited view", async () => {
    const { view, rerender } = renderEditor({ content: "original", loadId: 1 });
    const editor = tiptapOf(view.container);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, " edited");
    });
    expect(editor.getText()).toBe("original edited");

    // e.g. `git restore` puts the file back to exactly what was loaded.
    act(() => {
      rerender({ content: "original", loadId: 2 });
    });
    expect(editor.getText()).toBe("original");
  });

  it("re-rendering with the same loadId does not re-apply content", () => {
    const { view, rerender } = renderEditor({ content: "loaded", loadId: 1 });
    const editor = tiptapOf(view.container);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, " typed");
    });
    act(() => {
      rerender({ content: "loaded", loadId: 1 });
    });
    expect(editor.getText()).toBe("loaded typed");
  });

  it("a reload cancels a serialize scheduled before it", async () => {
    const { view, rerender, onChange } = renderEditor({ content: "before", loadId: 1 });
    const editor = tiptapOf(view.container);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, "!");
    });
    act(() => {
      rerender({ content: "from disk", loadId: 2 });
    });
    await act(() => sleep(SETTLE_MS));
    // The pre-reload edit must not surface as a change to the reloaded file.
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("from disk");
  });

  it("undo after a reload does not bring back the pre-reload text", () => {
    const { view, rerender } = renderEditor({ content: "first", loadId: 1 });
    const editor = tiptapOf(view.container);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, " local");
    });
    act(() => {
      rerender({ content: "external", loadId: 2 });
    });
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("external");
  });

  it("reports a reload's word count as a reload", () => {
    const { rerender, onWordCount } = renderEditor({ content: "one two", loadId: 1 });
    act(() => {
      rerender({ content: "one two three", loadId: 2 });
    });
    const reloads = onWordCount.mock.calls.filter((call) => call[2] === "reload");
    expect(reloads).toEqual([[3, "/ws/note.md", "reload"]]);
  });
});

describe("Editor — what counts as an edit", () => {
  it("opening a document that ends in a code block does not mark it dirty", async () => {
    const { onChange, onDirty } = renderEditor({
      content: "intro\n\n```\ncode\n```",
      loadId: 1,
    });
    await act(() => sleep(SETTLE_MS));
    expect(onDirty).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Replace All made while the editor is unfocused is saved", async () => {
    const { view, onChange, onDirty } = renderEditor({ content: "foo bar foo", loadId: 1 });
    const editor = tiptapOf(view.container);
    expect(editor.isFocused).toBe(false);
    act(() => {
      editor.commands.setFindTerm("foo");
      editor.commands.replaceAll("baz");
    });
    expect(onDirty).toHaveBeenCalled();
    await act(() => sleep(SETTLE_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe("baz bar baz");
  });
});

describe("Editor — configured once", () => {
  it("re-rendering doesn't reconfigure the ProseMirror view", () => {
    const onChange = mock((_markdown: string) => {});
    const props = { content: "text", loadId: 1, filePath: "/ws/note.md", onChange };
    const view = render(<Editor {...props} title="One" />);
    mounted.push(view);
    const editor = tiptapOf(view.container);
    let setOptionsCalls = 0;
    const original = editor.setOptions.bind(editor);
    editor.setOptions = (options) => {
      setOptionsCalls += 1;
      original(options);
    };

    act(() => {
      view.rerender(<Editor {...props} title="Two" />);
    });
    act(() => {
      view.rerender(<Editor {...props} title="Three" onError={() => {}} />);
    });
    expect(setOptionsCalls).toBe(0);
  });

  it("shows the body-H1 warning only while the document has a title", () => {
    const props = { content: "# Heading\n\nbody", loadId: 1, filePath: "/ws/note.md" };
    const view = render(<Editor {...props} showH1Warning={false} />);
    mounted.push(view);
    const scroll = () => view.container.querySelector(".editor-scroll");
    expect(scroll()?.classList.contains("editor-scroll--h1-warning")).toBe(false);
    act(() => {
      view.rerender(<Editor {...props} showH1Warning />);
    });
    expect(scroll()?.classList.contains("editor-scroll--h1-warning")).toBe(true);
    expect(view.container.querySelector("h1.h1-warning")).not.toBeNull();
  });
});
