import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../locales/en.json";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const parts = key.split(".");
      let value: unknown = en;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === "string" ? value : key;
    },
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { LongTextField } from "./LongTextField";

describe("LongTextField display mode", () => {
  it("renders the existing excerpt verbatim inside the longtext value span", () => {
    const html = renderToStaticMarkup(
      <LongTextField ariaLabel="Excerpt" value="A short summary." onSave={() => {}} />
    );
    expect(html).toContain("prop-longtext-value");
    expect(html).toContain("A short summary.");
  });

  it("falls back to the editable-field hint when the value is empty", () => {
    const html = renderToStaticMarkup(
      <LongTextField ariaLabel="Excerpt" value="" onSave={() => {}} />
    );
    expect(html).toContain(en.properties.editable_field_label);
  });

  it("encodes the value into the button's aria-label so screen readers announce it", () => {
    const html = renderToStaticMarkup(
      <LongTextField ariaLabel="Excerpt" value="Hello world" onSave={() => {}} />
    );
    expect(html).toContain('aria-label="Excerpt: Hello world"');
  });
});
