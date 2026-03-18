import { describe, expect, it } from "bun:test";
import { normalizeTaskLists } from "./taskLists";

describe("normalizeTaskLists", () => {
  it("converts bullet lists with task prefixes into task lists", () => {
    const doc = {
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
                  content: [{ type: "text", text: "[ ] draft intro" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "[x] ship update" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(normalizeTaskLists(doc)).toEqual({
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
                  content: [{ type: "text", text: "draft intro" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "ship update" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("leaves normal bullet lists unchanged", () => {
    const doc = {
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
                  content: [{ type: "text", text: "plain bullet" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(normalizeTaskLists(doc)).toEqual(doc);
  });
});
