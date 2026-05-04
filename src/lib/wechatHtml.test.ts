import { describe, expect, test } from "bun:test";
import { extractExcerpt } from "./wechatHtml";

describe("extractExcerpt", () => {
  test("returns first non-empty line of plain text", () => {
    expect(extractExcerpt("Hello world")).toBe("Hello world");
  });

  test("strips fenced code blocks", () => {
    const md = "```js\nconsole.log('hi');\n```\n\nActual content here.";
    expect(extractExcerpt(md)).toBe("Actual content here.");
  });

  test("strips inline code", () => {
    expect(extractExcerpt("Use `npm install` to install")).toBe(
      "Use  to install"
    );
  });

  test("strips ATX headings", () => {
    expect(extractExcerpt("## My Heading\n\nParagraph text.")).toBe(
      "My Heading"
    );
  });

  test("strips all heading levels", () => {
    expect(extractExcerpt("### Level 3")).toBe("Level 3");
    expect(extractExcerpt("# Level 1")).toBe("Level 1");
  });

  test("strips blockquote markers", () => {
    expect(extractExcerpt("> Quoted text here")).toBe("Quoted text here");
  });

  test("strips image syntax", () => {
    expect(extractExcerpt("![alt text](image.png)\n\nContent below.")).toBe(
      "Content below."
    );
  });

  test("replaces links with label text", () => {
    expect(extractExcerpt("Visit [my site](https://example.com) for details")).toBe(
      "Visit my site for details"
    );
  });

  test("strips bold markers", () => {
    expect(extractExcerpt("This is **bold** text")).toBe("This is bold text");
  });

  test("strips italic markers", () => {
    expect(extractExcerpt("This is *italic* text")).toBe("This is italic text");
  });

  test("strips strikethrough markers", () => {
    expect(extractExcerpt("This is ~~struck~~ text")).toBe(
      "This is struck text"
    );
  });

  test("strips unordered list markers", () => {
    expect(extractExcerpt("- First item\n- Second item")).toBe("First item");
  });

  test("strips ordered list markers", () => {
    expect(extractExcerpt("1. First item\n2. Second item")).toBe("First item");
  });

  test("truncates to maxLen (default 54)", () => {
    const long = "A".repeat(60);
    expect(extractExcerpt(long)).toBe("A".repeat(54));
    expect(extractExcerpt(long).length).toBe(54);
  });

  test("respects custom maxLen", () => {
    expect(extractExcerpt("Hello world", 5)).toBe("Hello");
  });

  test("returns empty string for empty input", () => {
    expect(extractExcerpt("")).toBe("");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(extractExcerpt("   \n\n  ")).toBe("");
  });

  test("skips blank lines to find first non-empty line", () => {
    expect(extractExcerpt("\n\n\nHere is the content")).toBe(
      "Here is the content"
    );
  });

  test("skips code block that leaves only blank lines before real text", () => {
    const md = "```python\nprint('hello')\n```\n\nThe real excerpt.";
    expect(extractExcerpt(md)).toBe("The real excerpt.");
  });

  test("handles markdown with only a code block and no prose", () => {
    const md = "```js\nconst x = 1;\n```";
    expect(extractExcerpt(md)).toBe("");
  });

  test("handles content with mixed markdown in a single line", () => {
    const md =
      "## Intro to **Rust** and [its ecosystem](https://rust-lang.org)";
    expect(extractExcerpt(md)).toBe("Intro to Rust and its ecosystem");
  });
});
