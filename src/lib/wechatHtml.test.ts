import { describe, expect, test } from "bun:test";
import { countLocalImages, extractExcerpt, hasMathBlocks } from "./wechatHtml";

describe("extractExcerpt", () => {
  test("returns first non-empty line of plain text", () => {
    expect(extractExcerpt("Hello world")).toBe("Hello world");
  });

  test("strips fenced code blocks", () => {
    const md = "```js\nconsole.log('hi');\n```\n\nActual content here.";
    expect(extractExcerpt(md)).toBe("Actual content here.");
  });

  test("strips inline code", () => {
    expect(extractExcerpt("Use `npm install` to install")).toBe("Use  to install");
  });

  test("strips ATX headings", () => {
    expect(extractExcerpt("## My Heading\n\nParagraph text.")).toBe("My Heading");
  });

  test("strips all heading levels", () => {
    expect(extractExcerpt("### Level 3")).toBe("Level 3");
    expect(extractExcerpt("# Level 1")).toBe("Level 1");
  });

  test("strips blockquote markers", () => {
    expect(extractExcerpt("> Quoted text here")).toBe("Quoted text here");
  });

  test("strips image syntax", () => {
    expect(extractExcerpt("![alt text](image.png)\n\nContent below.")).toBe("Content below.");
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
    expect(extractExcerpt("This is ~~struck~~ text")).toBe("This is struck text");
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
    expect(extractExcerpt("\n\n\nHere is the content")).toBe("Here is the content");
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
    const md = "## Intro to **Rust** and [its ecosystem](https://rust-lang.org)";
    expect(extractExcerpt(md)).toBe("Intro to Rust and its ecosystem");
  });
});

describe("hasMathBlocks", () => {
  test("detects block math", () => {
    expect(hasMathBlocks("$$E = mc^2$$")).toBe(true);
  });

  test("detects inline math", () => {
    expect(hasMathBlocks("The value $x = 5$ is interesting.")).toBe(true);
  });

  test("detects block math spanning multiple lines", () => {
    expect(hasMathBlocks("$$\n\\int_0^\\infty f(x)\\,dx\n$$")).toBe(true);
  });

  test("detects math mixed with prose", () => {
    expect(hasMathBlocks("Here is a formula: $a^2 + b^2 = c^2$ for right triangles.")).toBe(true);
  });

  test("returns false for plain text", () => {
    expect(hasMathBlocks("No math here, just words.")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(hasMathBlocks("")).toBe(false);
  });

  test("returns false for a single dollar sign (currency)", () => {
    expect(hasMathBlocks("It costs $5 to enter.")).toBe(false);
  });

  test("returns false for dollar sign at end of line with no closing pair", () => {
    expect(hasMathBlocks("Price: $100\nTax: $10")).toBe(false);
  });
});

describe("countLocalImages", () => {
  test("counts a single local image", () => {
    expect(countLocalImages("![alt](images/photo.png)")).toBe(1);
  });

  test("counts multiple local images", () => {
    const md = "![a](images/a.png)\n\n![b](images/b.jpg)\n\n![c](images/c.webp)";
    expect(countLocalImages(md)).toBe(3);
  });

  test("excludes http images", () => {
    expect(countLocalImages("![remote](http://example.com/img.png)")).toBe(0);
  });

  test("excludes https images", () => {
    expect(countLocalImages("![remote](https://example.com/img.png)")).toBe(0);
  });

  test("excludes data: URIs", () => {
    expect(countLocalImages("![inline](data:image/png;base64,abc123)")).toBe(0);
  });

  test("excludes asset:// scheme (Tauri asset protocol)", () => {
    expect(countLocalImages("![asset](asset://localhost/images/photo.png)")).toBe(0);
  });

  test("excludes blob: URIs", () => {
    expect(countLocalImages("![blob](blob:https://example.com/abc-123)")).toBe(0);
  });

  test("counts local but not remote in mixed content", () => {
    const md = [
      "![local](images/local.png)",
      "![remote](https://cdn.example.com/remote.jpg)",
      "![also local](./assets/other.png)",
    ].join("\n");
    expect(countLocalImages(md)).toBe(2);
  });

  test("handles root-relative paths as local", () => {
    expect(countLocalImages("![cover](/images/cover.jpg)")).toBe(1);
  });

  test("returns 0 for markdown with no images", () => {
    expect(countLocalImages("Just some text with no images.")).toBe(0);
  });

  test("returns 0 for empty string", () => {
    expect(countLocalImages("")).toBe(0);
  });

  test("ignores title text inside image syntax", () => {
    expect(countLocalImages('![alt](images/photo.png "My title")')).toBe(1);
  });
});
