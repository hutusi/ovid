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

  it("leaves mixed bullet lists unchanged", () => {
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

  it("converts nested task bullet lists into nested task lists", () => {
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
                  content: [{ type: "text", text: "[ ] launch" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "[x] write changelog" }],
                        },
                      ],
                    },
                  ],
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
                  content: [{ type: "text", text: "launch" }],
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: true },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "write changelog" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("treats uppercase [X] as checked", () => {
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
                  content: [{ type: "text", text: "[X] shipped" }],
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
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "shipped" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("preserves inline marks after removing the task prefix", () => {
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
                  content: [
                    { type: "text", text: "[ ] " },
                    {
                      type: "text",
                      text: "bold text",
                      marks: [{ type: "bold" }],
                    },
                  ],
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
                  content: [
                    {
                      type: "text",
                      text: "bold text",
                      marks: [{ type: "bold" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
