import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { paletteIndexForSlug, shortenTitle, TextCover } from "./TextCover";

describe("shortenTitle", () => {
  it("returns short titles unchanged", () => {
    expect(shortenTitle("Hello")).toBe("Hello");
    expect(shortenTitle("Issue 1")).toBe("Issue 1");
  });

  it("takes the first 4 chars for long CJK titles", () => {
    // 13 chars (>12), so the CJK detector fires and the 4-char rule applies.
    expect(shortenTitle("中文测试标题一二三四五六七八")).toBe("中文测试");
  });

  it("takes the first two Latin words when title is long", () => {
    expect(shortenTitle("Modern CSS Layouts For Production")).toBe("Modern CSS");
  });

  it("falls back to the first word when two words exceed 20 chars", () => {
    expect(shortenTitle("Extraordinarilylong sentence here")).toBe("Extraordinarilylong");
  });
});

describe("paletteIndexForSlug", () => {
  it("is slug.length modulo 7", () => {
    expect(paletteIndexForSlug("")).toBe(0);
    expect(paletteIndexForSlug("abc")).toBe(3);
    expect(paletteIndexForSlug("seven--")).toBe(0);
    expect(paletteIndexForSlug("ai-nexus-weekly")).toBe(15 % 7);
  });
});

describe("TextCover render", () => {
  it("uses the provided text when present", () => {
    const html = renderToStaticMarkup(
      <TextCover text="Issue 1" fallbackText="AI Nexus Weekly" slug="week-1" />
    );
    expect(html).toContain("Issue 1");
    expect(html).not.toContain("AI Nexus Weekly");
  });

  it("falls back to a shortened title when text is empty", () => {
    const html = renderToStaticMarkup(
      <TextCover text="" fallbackText="A Long Latin Cover Title" slug="x" />
    );
    expect(html).toContain("A Long");
  });

  it("picks the palette class deterministically from the slug length", () => {
    const html = renderToStaticMarkup(
      <TextCover text="T" fallbackText="" slug="ai-nexus-weekly" />
    );
    // 15 % 7 === 1
    expect(html).toContain("text-cover-palette-1");
    expect(html).toContain("text-cover-accent-1");
  });

  it("exposes the displayed text as an aria-label so screen readers announce it", () => {
    const html = renderToStaticMarkup(<TextCover text="Issue 1" fallbackText="" slug="x" />);
    expect(html).toContain('aria-label="Issue 1"');
    expect(html).toContain('role="img"');
  });
});
