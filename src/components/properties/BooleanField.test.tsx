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

import { PublishingBooleanField } from "./BooleanField";

function render(fieldKey: string, value: unknown) {
  return renderToStaticMarkup(
    <PublishingBooleanField fieldKey={fieldKey} value={value as never} onSave={mock(() => {})} />
  );
}

describe("PublishingBooleanField state label", () => {
  it("draft: true renders the 'Draft' state", () => {
    const markup = render("draft", true);
    expect(markup).toContain('prop-boolean-state">Draft<');
  });

  it("draft: false renders the 'Published' state", () => {
    const markup = render("draft", false);
    expect(markup).toContain('prop-boolean-state">Published<');
  });

  it("featured: true renders the generic 'Enabled' state (not draft-specific)", () => {
    const markup = render("featured", true);
    expect(markup).toContain('prop-boolean-state">Enabled<');
    expect(markup).not.toContain('prop-boolean-state">Draft<');
    expect(markup).not.toContain('prop-boolean-state">Published<');
  });

  it("pinned: false renders the generic 'Disabled' state", () => {
    const markup = render("pinned", false);
    expect(markup).toContain('prop-boolean-state">Disabled<');
  });
});
