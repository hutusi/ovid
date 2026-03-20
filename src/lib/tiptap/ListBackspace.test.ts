import { describe, expect, it } from "bun:test";
import StarterKit from "@tiptap/starter-kit";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { applyBackspaceAction, getBackspaceAction, ListBackspace } from "./ListBackspace";

function createEditor(content: Record<string, unknown>) {
  return new Editor({
    extensions: [StarterKit],
    content,
  });
}

describe("ListBackspace", () => {
  it("detects a non-empty list item at text start", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "alpha" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "beta" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const betaStart = 12;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, betaStart)));

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftListItem" });

    editor.destroy();
  });

  it("falls through when the cursor is not at the start of the list item text", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "alpha" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const middleOfAlpha = 4;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, middleOfAlpha))
    );

    expect(getBackspaceAction(editor.state)).toBeNull();

    editor.destroy();
  });

  it("falls through for empty list items", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });

    const emptyItemStart = 3;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, emptyItemStart))
    );

    expect(getBackspaceAction(editor.state)).toBeNull();

    editor.destroy();
  });

  it("detects a non-empty blockquote paragraph at text start", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "quoted" }],
            },
          ],
        },
      ],
    });

    const quoteStart = 2;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, quoteStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftBlockquote" });

    editor.destroy();
  });

  it("falls through for empty blockquote paragraphs", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    const emptyQuoteStart = 2;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, emptyQuoteStart))
    );

    expect(getBackspaceAction(editor.state)).toBeNull();

    editor.destroy();
  });

  it("detects heading unwrap at text start", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });

    const headingStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, headingStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "unwrapHeading" });

    editor.destroy();
  });

  it("unwraps headings directly to paragraphs", () => {
    const editor = new Editor({
      extensions: [StarterKit, ListBackspace],
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Title" }],
          },
        ],
      },
    });

    const headingStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, headingStart))
    );

    expect(applyBackspaceAction(editor)).toBe(true);

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });

    editor.destroy();
  });

  it("also unwraps h1 to a paragraph", () => {
    const editor = new Editor({
      extensions: [StarterKit, ListBackspace],
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Title" }],
          },
        ],
      },
    });

    const headingStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, headingStart))
    );

    expect(applyBackspaceAction(editor)).toBe(true);

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });

    editor.destroy();
  });
});
