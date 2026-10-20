import { describe, expect, it } from "bun:test";
import { Schema } from "@tiptap/pm/model";
import { placeholderSelection } from "./newDocumentFocus";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
  },
});

function doc(...paragraphs: string[]) {
  return schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : []))
  );
}

const PLACEHOLDER = "Write your content here...";

describe("placeholderSelection", () => {
  it("selects a lone scaffold placeholder so typing replaces it", () => {
    const d = doc(PLACEHOLDER);
    const range = placeholderSelection(d, PLACEHOLDER);
    expect(range).toEqual({ from: 1, to: 1 + PLACEHOLDER.length });
    expect(d.textBetween(range?.from ?? 0, range?.to ?? 0)).toBe(PLACEHOLDER);
  });

  it("selects the placeholder when it is the last of several blocks", () => {
    const d = doc("Intro", PLACEHOLDER);
    const range = placeholderSelection(d, PLACEHOLDER);
    expect(range && d.textBetween(range.from, range.to)).toBe(PLACEHOLDER);
  });

  it("never selects text the user wrote", () => {
    expect(placeholderSelection(doc("My first paragraph"), PLACEHOLDER)).toBeNull();
    expect(placeholderSelection(doc(PLACEHOLDER, "Kept writing"), PLACEHOLDER)).toBeNull();
    expect(placeholderSelection(doc(""), PLACEHOLDER)).toBeNull();
  });
});
