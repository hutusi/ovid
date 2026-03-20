import { describe, expect, it } from "bun:test";
import { normalizeMarkdownSpacing } from "./markdown";

describe("normalizeMarkdownSpacing", () => {
  it("inserts a blank line between a standalone image and following heading", () => {
    const input = "![Alt](./cover.png)\n## Heading";

    expect(normalizeMarkdownSpacing(input)).toBe("![Alt](./cover.png)\n\n## Heading");
  });

  it("leaves already separated image and heading blocks unchanged", () => {
    const input = "![Alt](./cover.png)\n\n## Heading";

    expect(normalizeMarkdownSpacing(input)).toBe(input);
  });

  it("does not add spacing when the next line is normal paragraph text", () => {
    const input = "![Alt](./cover.png)\nCaption";

    expect(normalizeMarkdownSpacing(input)).toBe(input);
  });
});
