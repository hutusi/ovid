import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectField } from "./SelectField";

const SORT_OPTIONS = [
  { value: "date-asc", label: "Date asc" },
  { value: "date-desc", label: "Date desc" },
  { value: "manual", label: "Manual" },
];

function render(value: string | undefined) {
  return renderToStaticMarkup(
    <SelectField ariaLabel="Sort" value={value} options={SORT_OPTIONS} onSave={() => {}} />
  );
}

describe("SelectField", () => {
  it("renders every known option", () => {
    const html = render("date-desc");
    for (const opt of SORT_OPTIONS) {
      expect(html).toContain(`value="${opt.value}"`);
      expect(html).toContain(`>${opt.label}<`);
    }
  });

  it("marks the current value as selected", () => {
    const html = render("manual");
    expect(html).toMatch(/value="manual"[^>]*selected/);
  });

  it("prepends an unknown current value so it remains visible", () => {
    const html = render("weight");
    // Fallback option appears with the raw value as its label; React server
    // renders it with the `selected` attribute since it matches `value`.
    expect(html).toMatch(/<option value="weight"[^>]*>weight<\/option>/);
    expect(html).toMatch(/value="weight"[^>]*selected/);
  });

  it("does not add a fallback option when the value is one of the known options", () => {
    const html = render("date-asc");
    // Each value appears exactly once in `value="…"` attributes.
    const matches = html.match(/value="date-asc"/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
