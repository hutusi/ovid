import { describe, expect, it } from "bun:test";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import StarterKit from "@tiptap/starter-kit";
import { type AnyExtension, Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { applyBackspaceAction, getBackspaceAction, ListBackspace } from "./ListBackspace";

function createEditor(content: Record<string, unknown>, extensions: AnyExtension[] = [StarterKit]) {
  return new Editor({
    extensions,
    content,
  });
}

function findNthNodeStart(editor: Editor, nodeType: string, occurrence = 1): number {
  let count = 0;
  let pos = -1;

  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name !== nodeType) {
      return true;
    }

    count += 1;
    if (count === occurrence) {
      pos = nodePos + 1;
      return false;
    }

    return true;
  });

  if (pos === -1) {
    throw new Error(`Could not find ${occurrence} occurrence of node type ${nodeType}`);
  }

  return pos;
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

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftListItem", itemType: "listItem" });

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

  it("detects empty list items at text start", () => {
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

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftListItem", itemType: "listItem" });

    editor.destroy();
  });

  it("detects a non-empty task item at text start", () => {
    const editor = createEditor(
      {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "todo" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      [StarterKit, TaskList, TaskItem]
    );

    const taskStart = 3;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, taskStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftListItem", itemType: "taskItem" });

    editor.destroy();
  });

  it("detects empty task items at text start", () => {
    const editor = createEditor(
      {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
      [StarterKit, TaskList, TaskItem]
    );

    const taskStart = 3;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, taskStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftListItem", itemType: "taskItem" });

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

  it("unwraps the nearest blockquote layer before lifting the parent list item", () => {
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
                  type: "blockquote",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "quoted" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const quoteStart = 4;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, quoteStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftBlockquote" });

    editor.destroy();
  });

  it("lifts the nearest list item layer before unwrapping an outer blockquote", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "item" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const itemStart = 4;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, itemStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "liftListItem", itemType: "listItem" });

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

  it("detects empty code block unwrap at text start", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [],
        },
      ],
    });

    const codeStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, codeStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "unwrapEmptyCodeBlock" });

    editor.destroy();
  });

  it("preserves non-empty code blocks at text start", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    });

    const codeStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, codeStart))
    );

    expect(getBackspaceAction(editor.state)).toEqual({ type: "preserveCodeBlock" });

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

  it("unwraps empty code blocks to paragraphs", () => {
    const editor = new Editor({
      extensions: [StarterKit, ListBackspace],
      content: {
        type: "doc",
        content: [
          {
            type: "codeBlock",
            content: [],
          },
        ],
      },
    });

    const codeStart = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, codeStart))
    );

    expect(applyBackspaceAction(editor)).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    editor.destroy();
  });

  it("consumes backspace at the start of non-empty code blocks without merging", () => {
    const editor = new Editor({
      extensions: [StarterKit, ListBackspace],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "intro" }],
          },
          {
            type: "codeBlock",
            content: [{ type: "text", text: "const x = 1;" }],
          },
        ],
      },
    });

    const codeStart = findNthNodeStart(editor, "codeBlock");
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, codeStart))
    );

    expect(applyBackspaceAction(editor)).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "intro" }],
        },
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    });

    editor.destroy();
  });

  it("unwraps empty list items instead of merging backward", () => {
    const editor = new Editor({
      extensions: [StarterKit, ListBackspace],
      content: {
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
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
    });

    const emptyItemStart = findNthNodeStart(editor, "paragraph", 2);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, emptyItemStart))
    );

    expect(applyBackspaceAction(editor)).toBe(true);

    expect(editor.getJSON()).toEqual({
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
        {
          type: "paragraph",
        },
      ],
    });

    editor.destroy();
  });
});
