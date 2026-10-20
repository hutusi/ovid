import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../locales/en.json";

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

mock.module("@tauri-apps/api/core", () => ({
  invoke: mock(() => Promise.resolve(null)),
  convertFileSrc: (path: string) => `file://${path}`,
}));

import type { ParsedFrontmatter } from "../lib/frontmatter";
import { PropertiesPanel } from "./PropertiesPanel";

function renderPanel(frontmatter: ParsedFrontmatter) {
  return renderToStaticMarkup(
    <PropertiesPanel frontmatter={frontmatter} visible={true} onFieldChange={mock(() => {})} />
  );
}

describe("PropertiesPanel publishing booleans", () => {
  it("renders a remove button for the draft field (regression: was hardcoded undefined)", () => {
    const markup = renderPanel({ draft: false });
    expect(markup).toContain('aria-label="Remove Draft metadata"');
  });

  it("renders a remove button for the featured field", () => {
    const markup = renderPanel({ featured: false });
    expect(markup).toContain('aria-label="Remove Featured metadata"');
  });

  it("renders a remove button for the pinned field", () => {
    const markup = renderPanel({ pinned: false });
    expect(markup).toContain('aria-label="Remove Pinned metadata"');
  });

  it("renders remove buttons for all publishing booleans together", () => {
    const markup = renderPanel({ draft: true, featured: false, pinned: true });
    expect(markup).toContain('aria-label="Remove Draft metadata"');
    expect(markup).toContain('aria-label="Remove Featured metadata"');
    expect(markup).toContain('aria-label="Remove Pinned metadata"');
  });
});

describe("PropertiesPanel with unparseable frontmatter", () => {
  it("explains why it is read-only instead of offering fields", () => {
    const markup = renderToStaticMarkup(
      <PropertiesPanel
        frontmatter={{}}
        frontmatterError={"unexpected end of the stream within a flow collection (2:1)\n\n 1 | x"}
        visible={true}
        onFieldChange={mock(() => {})}
      />
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain(en.properties.frontmatter_invalid_title.replace("'", "&#x27;"));
    expect(markup).toContain("unexpected end of the stream within a flow collection (2:1)");
    // Only the first line of the parser message is shown.
    expect(markup).not.toContain("1 | x");
    // No way to add a field to a block that can't be rewritten.
    expect(markup).not.toContain(en.properties.no_frontmatter);
    expect(markup).not.toContain("prop-add");
  });
});
