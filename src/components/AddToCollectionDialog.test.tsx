import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../locales/en.json";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const parts = key.split(".");
      let value: unknown = en;
      for (const part of parts) {
        if (value && typeof value === "object") value = (value as Record<string, unknown>)[part];
        else return key;
      }
      let str = typeof value === "string" ? value : key;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{{${k}}}`, String(v));
      return str;
    },
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import type { CollectionCandidate } from "../lib/collection";
import { AddToCollectionDialog } from "./AddToCollectionDialog";

function render(candidates: CollectionCandidate[]) {
  return renderToStaticMarkup(
    <AddToCollectionDialog candidates={candidates} onConfirm={() => {}} onCancel={() => {}} />
  );
}

describe("AddToCollectionDialog", () => {
  const candidates: CollectionCandidate[] = [
    { key: "post:async-js", kind: "post", label: "Async JS", item: { post: "async-js" } },
    { key: "series:deep-dive", kind: "series", label: "Deep Dive", item: { series: "deep-dive" } },
  ];

  it("renders each candidate's label and kind badge", () => {
    const markup = render(candidates);
    expect(markup).toContain("Async JS");
    expect(markup).toContain("Deep Dive");
    expect(markup).toContain(">post<");
    expect(markup).toContain(">series<");
  });

  it("shows the empty state when there are no candidates", () => {
    expect(render([])).toContain("No posts or series found");
  });
});
