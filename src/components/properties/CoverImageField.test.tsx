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

// CoverImageField imports commands → Tauri at module load; stub the surface
// the component touches so the SSR test doesn't pull in the Tauri runtime.
mock.module("../../lib/commands", () => ({
  commands: {
    assets: {
      pickImage: mock(async () => null),
      save: mock(async () => ""),
      saveFromBytes: mock(async () => ""),
    },
  },
}));
mock.module("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `file://${p}`,
}));

import { CoverImageField } from "./CoverImageField";

function render(value: string) {
  return renderToStaticMarkup(
    <CoverImageField
      value={value}
      previewVisible={true}
      slug="ai-nexus-weekly"
      fallbackText="AI Nexus Weekly"
      onTogglePreview={() => {}}
      onSave={() => {}}
      onRemove={() => {}}
    />
  );
}

describe("CoverImageField mode dispatch", () => {
  it("empty value: shows the dropzone hint and both 'Choose file' and 'Use text cover' actions", () => {
    const html = render("");
    expect(html).toContain(en.properties.cover_dropzone_hint);
    expect(html).toContain(en.properties.cover_choose);
    expect(html).toContain(en.properties.cover_use_text);
    expect(html).not.toContain(en.properties.cover_use_image);
    expect(html).not.toContain(en.properties.cover_text_hint);
    // The raw path EditableValue is the bottom field — present in image mode.
    expect(html).toContain(en.properties.cover_path);
  });

  it("image value: renders the path thumbnail and exposes 'Use text cover'", () => {
    const html = render("/images/hero.jpg");
    expect(html).toContain('class="prop-cover-thumb"');
    expect(html).toContain(en.properties.cover_use_text);
    expect(html).not.toContain(en.properties.cover_use_image);
    expect(html).not.toContain('class="text-cover');
  });

  it("text value: renders the TextCover preview, the hint, and 'Use image instead'", () => {
    const html = render("text:Issue 1");
    // TextCover preview present with the supplied text and slug-derived palette.
    expect(html).toContain('class="text-cover');
    expect(html).toContain("Issue 1");
    // Mode-switch back to image, plus the explanatory hint.
    expect(html).toContain(en.properties.cover_use_image);
    expect(html).toContain(en.properties.cover_text_hint);
    expect(html).not.toContain(en.properties.cover_use_text);
    // The raw EditableValue path label is gone; in its place, the cover-text input.
    expect(html).not.toContain(en.properties.cover_path);
    expect(html).toContain('class="prop-cover-text-input"');
  });

  it("text value with empty suffix: falls back to the shortened title in the preview", () => {
    // "AI Nexus Weekly" is > 12 chars Latin → first 2 words = "AI Nexus".
    const html = render("text:");
    expect(html).toContain("AI Nexus");
  });

  it("tooltips on mode-switch buttons explain the action without a click", () => {
    const emptyHtml = render("");
    expect(emptyHtml).toContain(`title="${en.properties.cover_use_text_tooltip}"`);
    const textHtml = render("text:Foo");
    expect(textHtml).toContain(`title="${en.properties.cover_use_image_tooltip}"`);
  });
});
