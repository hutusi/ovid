import { describe, expect, it } from "bun:test";
import {
  CODE_BLOCK_LANGUAGES,
  isPresetCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from "./codeBlockLanguages";

describe("codeBlockLanguages", () => {
  it("normalizes blank language labels to plain code", () => {
    expect(normalizeCodeBlockLanguage("")).toBeNull();
    expect(normalizeCodeBlockLanguage("   ")).toBeNull();
  });

  it("canonicalizes preset labels case-insensitively", () => {
    expect(normalizeCodeBlockLanguage("TypeScript")).toBe("typescript");
    expect(normalizeCodeBlockLanguage(" JSON ")).toBe("json");
  });

  it("preserves custom labels after trimming", () => {
    expect(normalizeCodeBlockLanguage(" mermaid ")).toBe("mermaid");
    expect(normalizeCodeBlockLanguage("tsx")).toBe("tsx");
  });

  it("detects preset labels", () => {
    expect(isPresetCodeBlockLanguage("typescript")).toBeTrue();
    expect(isPresetCodeBlockLanguage("TypeScript")).toBeFalse();
    expect(isPresetCodeBlockLanguage("mermaid")).toBeFalse();
    expect(isPresetCodeBlockLanguage(null)).toBeFalse();
  });

  it("keeps the preset list stable for the picker", () => {
    expect(CODE_BLOCK_LANGUAGES).toContain("typescript");
    expect(CODE_BLOCK_LANGUAGES).toContain("rust");
  });
});
