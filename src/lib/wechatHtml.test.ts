import { describe, expect, test } from "bun:test";
import { markdownToWechatHtml } from "./wechatHtml";
import { countLocalImages, extractExcerpt, hasMathBlocks } from "./wechatMarkdownAnalysis";

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

  test("returns false for two currency dollar signs on the same line", () => {
    expect(hasMathBlocks("Save $10 on a $50 purchase")).toBe(false);
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

// markdownToWechatHtml — the actual pipeline. Tests assert against the
// post-render HTML string directly. Since renderer rules emit pre-styled
// HTML, tests are pure (no DOM) and run in Bun.

describe("markdownToWechatHtml — block elements", () => {
  test("paragraphs get inline color/spacing styles", () => {
    const { html } = markdownToWechatHtml("Hello world");
    expect(html).toContain('<p style="margin: 0 0 1.2em;');
    expect(html).toContain("color: #333333");
    expect(html).toContain("Hello world");
  });

  test("each heading level gets its own style", () => {
    for (let level = 1; level <= 6; level++) {
      const { html } = markdownToWechatHtml(`${"#".repeat(level)} Heading ${level}`);
      expect(html).toContain(`<h${level} style=`);
      expect(html).toContain(`Heading ${level}`);
      expect(html).toContain(`</h${level}>`);
    }
  });

  test("h2 specifically carries the side-border accent", () => {
    const { html } = markdownToWechatHtml("## Section");
    expect(html).toContain("border-left: 4px solid #576b95");
  });

  test("blockquote renders with accent border + tinted background", () => {
    const { html } = markdownToWechatHtml("> Quoted text");
    expect(html).toContain("<blockquote");
    expect(html).toContain("border-left: 4px solid #d1d5db");
    expect(html).toContain("Quoted text");
  });

  test("horizontal rule renders as styled <hr>", () => {
    const { html } = markdownToWechatHtml("---");
    expect(html).toContain('<hr style="border: none; border-top: 1px solid #e5e7eb');
  });

  test("unordered list emits <ul><li> with both styled", () => {
    const { html } = markdownToWechatHtml("- alpha\n- beta");
    expect(html).toContain('<ul style="padding-left: 1.8em');
    expect(html).toContain("<li ");
    expect(html).toContain("alpha");
    expect(html).toContain("beta");
  });

  test("ordered list emits <ol> rather than <ul>", () => {
    const { html } = markdownToWechatHtml("1. first\n2. second");
    expect(html).toContain("<ol ");
    expect(html).not.toContain("<ul ");
  });

  test("ordered list preserves a non-1 start value", () => {
    const { html } = markdownToWechatHtml("5. fifth\n6. sixth");
    expect(html).toMatch(/<ol\s+start="5"/);
  });

  test("table renders headers and cells with their own styles", () => {
    const md = ["| Col A | Col B |", "| --- | --- |", "| a1 | b1 |"].join("\n");
    const { html } = markdownToWechatHtml(md);
    expect(html).toContain("<table ");
    expect(html).toContain("border-collapse: collapse");
    expect(html).toContain("<th ");
    expect(html).toContain("background: #f3f4f6");
    expect(html).toContain("<td ");
    expect(html).toContain("Col A");
    expect(html).toContain("a1");
  });

  test("table preserves per-column alignment (right / center)", () => {
    const md = ["| Left | Center | Right |", "| --- | :---: | ---: |", "| a | b | c |"].join("\n");
    const { html } = markdownToWechatHtml(md);
    // Both header and body cells in the centered column carry text-align:center,
    // and likewise text-align:right for the right-aligned column.
    expect(html).toMatch(/<th[^>]*text-align:center[^>]*>Center<\/th>/);
    expect(html).toMatch(/<th[^>]*text-align:right[^>]*>Right<\/th>/);
    expect(html).toMatch(/<td[^>]*text-align:center[^>]*>b<\/td>/);
    expect(html).toMatch(/<td[^>]*text-align:right[^>]*>c<\/td>/);
  });
});

describe("markdownToWechatHtml — inline marks", () => {
  test("strong, em, strikethrough each get their inline style", () => {
    const { html } = markdownToWechatHtml("**bold** and *italic* and ~~struck~~");
    expect(html).toContain('<strong style="font-weight: bold;">bold</strong>');
    expect(html).toContain('<em style="font-style: italic;">italic</em>');
    expect(html).toContain('<s style="text-decoration: line-through;">struck</s>');
  });

  test("inline code is the pink-on-grey badge", () => {
    const { html } = markdownToWechatHtml("Run `npm install` first");
    expect(html).toContain("<code ");
    expect(html).toContain("background: #f6f8fa");
    expect(html).toContain("color: #e83e8c");
    expect(html).toContain("npm install");
  });

  test("inline code escapes HTML special characters", () => {
    const { html } = markdownToWechatHtml("Use `<div>` here");
    expect(html).toContain("&lt;div&gt;");
    expect(html).not.toContain("<code><div>");
  });
});

describe("markdownToWechatHtml — code blocks", () => {
  test("fenced code block emits dark <pre> with transparent <code>", () => {
    const { html } = markdownToWechatHtml("```\nconst x = 1;\n```");
    expect(html).toContain('<pre style="background: #1e1e1e');
    expect(html).toContain("font-size: 14px; background: transparent");
    expect(html).toContain("const x = 1;");
  });

  test("fenced code block replaces every newline with <br>", () => {
    const { html } = markdownToWechatHtml("```\nline 1\nline 2\nline 3\n```");
    // Three input lines + trailing newline → at least 3 <br>s separating them.
    const brCount = (html.match(/<br>/g) ?? []).length;
    expect(brCount).toBeGreaterThanOrEqual(3);
    expect(html).toContain("line 1");
    expect(html).toContain("line 2");
    expect(html).toContain("line 3");
  });

  test("fenced code block escapes HTML inside the body", () => {
    const { html } = markdownToWechatHtml("```\n<script>alert(1)</script>\n```");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  test("indented (4-space) code block uses the same styling as fenced", () => {
    const { html } = markdownToWechatHtml("    indented code");
    expect(html).toContain('<pre style="background: #1e1e1e');
    expect(html).toContain("indented code");
  });
});

describe("markdownToWechatHtml — links and images", () => {
  test("absolute http(s) link keeps href and gets the brand-color style", () => {
    const { html } = markdownToWechatHtml("[example](https://example.com)");
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain("color: #576b95");
    expect(html).toContain("example</a>");
  });

  test("relative href is dropped because WeChat rejects it (errcode 45166)", () => {
    const { html } = markdownToWechatHtml("[guide](./docs/guide.md)");
    expect(html).not.toContain("href=");
    expect(html).toContain("<a ");
    expect(html).toContain("guide</a>");
  });

  test("root-relative href is also dropped", () => {
    const { html } = markdownToWechatHtml("[home](/index)");
    expect(html).not.toContain("href=");
  });

  test("image keeps src and alt and gains the responsive style", () => {
    const { html } = markdownToWechatHtml("![cover](images/cover.png)");
    expect(html).toContain('<img src="images/cover.png"');
    expect(html).toContain('alt="cover"');
    expect(html).toContain("max-width: 100%");
  });

  test("image src with quotes/brackets is sanitised (no raw script tag survives)", () => {
    // markdown-it URL-encodes dangerous chars in src attributes (e.g. `"` → %22).
    // The exact escape form (HTML entity vs URL escape) doesn't matter — the
    // contract is that no executable HTML survives the round-trip.
    const { html } = markdownToWechatHtml('![evil]("><script>x</script>)');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("%3Cscript"); // URL-encoded form is fine
  });
});

describe("markdownToWechatHtml — task lists", () => {
  test("unchecked task becomes ☐", () => {
    const { html } = markdownToWechatHtml("- [ ] todo");
    expect(html).toContain("☐");
    expect(html).toContain("todo");
    expect(html).not.toContain("<input");
  });

  test("checked task becomes ☑", () => {
    const { html } = markdownToWechatHtml("- [x] done");
    expect(html).toContain("☑");
    expect(html).toContain("done");
    expect(html).not.toContain("<input");
  });

  test("mixed list yields the right glyph per item", () => {
    const { html } = markdownToWechatHtml("- [x] done\n- [ ] todo");
    expect(html).toContain("☑");
    expect(html).toContain("☐");
    expect(html.indexOf("☑")).toBeLessThan(html.indexOf("☐"));
  });
});

describe("markdownToWechatHtml — math", () => {
  test("inline math is stripped and hasMath=true", () => {
    const { html, hasMath } = markdownToWechatHtml("Inline $x = 1$ math");
    expect(hasMath).toBe(true);
    expect(html).not.toContain("$");
  });

  test("block math is stripped and hasMath=true", () => {
    const { html, hasMath } = markdownToWechatHtml("Before\n\n$$E=mc^2$$\n\nAfter");
    expect(hasMath).toBe(true);
    expect(html).not.toContain("E=mc^2");
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  test("no math → hasMath=false and content unchanged in spirit", () => {
    const { html, hasMath } = markdownToWechatHtml("Just prose");
    expect(hasMath).toBe(false);
    expect(html).toContain("Just prose");
  });
});

describe("markdownToWechatHtml — composition", () => {
  test("multi-block document keeps each block's styling", () => {
    const md = [
      "# Title",
      "",
      "Paragraph with **bold** text.",
      "",
      "- list item 1",
      "- list item 2",
      "",
      "> quote",
    ].join("\n");
    const { html } = markdownToWechatHtml(md);
    expect(html).toContain("<h1 ");
    expect(html).toContain("<p ");
    expect(html).toContain("<strong ");
    expect(html).toContain("<ul ");
    expect(html).toContain("<blockquote ");
  });

  test("disallows raw HTML in source (markdown-it html: false)", () => {
    const { html } = markdownToWechatHtml("Hello <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
