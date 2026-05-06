import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../locales/en.json";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const parts = key.split(".");
      let value: unknown = en;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      let str = typeof value === "string" ? value : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{{${k}}}`, String(v));
        }
      }
      return str;
    },
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import type { FrontmatterValue } from "../../lib/frontmatter";
import { CustomMetadataField } from "./CustomMetadataField";

function render(value: FrontmatterValue) {
  return renderToStaticMarkup(
    <CustomMetadataField
      fieldKey="custom"
      value={value}
      onSave={mock(() => {})}
      onRemove={mock(() => {})}
    />
  );
}

describe("CustomMetadataField type dispatch", () => {
  it("renders BooleanField for boolean values", () => {
    const markup = render(true);
    expect(markup).toContain("prop-boolean-toggle");
  });

  it("renders TagInput for string array values", () => {
    const markup = render(["foo", "bar"]);
    expect(markup).toContain("tag-input-area");
    expect(markup).toContain(">foo<");
    expect(markup).toContain(">bar<");
  });

  it("renders DateField for ISO date strings", () => {
    const markup = render("2025-03-15");
    expect(markup).toContain("prop-editable-area");
    // DateField wraps the formatted date in prop-value
    expect(markup).toContain("prop-value");
  });

  it("renders EditableValue for plain text values", () => {
    const markup = render("hello world");
    expect(markup).toContain("prop-editable-area");
    expect(markup).toContain("hello world");
  });

  it("renders EditableValue for number values", () => {
    const markup = render(42);
    expect(markup).toContain("prop-editable-area");
    expect(markup).toContain(">42<");
  });
});
