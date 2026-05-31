import { describe, expect, it } from "bun:test";
import { formatDate } from "./DateField";

describe("formatDate", () => {
  it("formats a valid ISO date in en", () => {
    const result = formatDate("2025-03-15", "en");
    expect(result).not.toBe("2025-03-15");
    expect(result).toContain("2025");
    expect(result).toContain("Mar");
  });

  it("formats a valid ISO date in zh-CN", () => {
    const result = formatDate("2025-03-15", "zh-CN");
    expect(result).not.toBe("2025-03-15");
    // zh-CN medium dateStyle renders the localized year/month markers (年/月);
    // assert on the year digits and Chinese characters rather than a brittle
    // exact string to stay tolerant of Intl version drift.
    expect(result).toContain("2025");
    expect(result).toMatch(/[一-鿿]/);
  });

  it("returns the input when the date is invalid (try/catch fallback)", () => {
    expect(formatDate("not-a-date", "en")).toBe("not-a-date");
  });

  it("returns the input for empty string", () => {
    expect(formatDate("", "en")).toBe("");
  });
});
