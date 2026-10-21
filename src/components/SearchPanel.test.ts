import { describe, expect, it, mock } from "bun:test";

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const { limitResults, MAX_RENDERED_RESULT_FILES } = await import("./SearchPanel");

describe("limitResults", () => {
  it("keeps the top-ranked files up to the cap and counts the rest", () => {
    const results = Array.from({ length: MAX_RENDERED_RESULT_FILES + 50 }, (_, i) => i);
    const { shown, hidden } = limitResults(results);
    expect(shown).toHaveLength(MAX_RENDERED_RESULT_FILES);
    expect(shown[0]).toBe(0);
    expect(hidden).toBe(50);
  });

  it("passes small result sets through untouched", () => {
    expect(limitResults([1, 2, 3])).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });
});
