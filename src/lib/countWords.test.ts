import { describe, expect, it } from "bun:test";
import { countWords } from "./countWords";

describe("countWords", () => {
  it("counts latin words by whitespace", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("  the   quick  brown fox ")).toBe(4);
  });

  it("counts each CJK character as one word", () => {
    expect(countWords("你好世界")).toBe(4);
    expect(countWords("一二三四五")).toBe(5);
  });

  it("counts mixed CJK and latin", () => {
    expect(countWords("你好 world")).toBe(3);
    expect(countWords("hello世界world")).toBe(4);
  });

  it("ignores CJK punctuation and standalone punctuation", () => {
    expect(countWords("你好，世界！")).toBe(4);
    expect(countWords("— … ——")).toBe(0);
  });

  it("keeps intra-word apostrophes and hyphens as one word", () => {
    expect(countWords("it's a test-case")).toBe(3);
  });

  it("counts numbers as words", () => {
    expect(countWords("chapter 12 of 30")).toBe(4);
  });

  it("returns 0 for empty or whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts Japanese kana and Korean hangul per character", () => {
    expect(countWords("こんにちは")).toBe(5);
    expect(countWords("안녕하세요")).toBe(5);
  });
});
