import { describe, expect, it } from "bun:test";
import { formatDate } from "./DateField";

describe("formatDate", () => {
  it("formats a valid ISO date", () => {
    const result = formatDate("2025-03-15");
    expect(result).not.toBe("2025-03-15");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the input when the date is invalid (try/catch fallback)", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("returns the input for empty string", () => {
    expect(formatDate("")).toBe("");
  });
});
