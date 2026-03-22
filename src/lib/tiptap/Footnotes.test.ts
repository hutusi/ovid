import { describe, expect, it } from "bun:test";
import { Schema } from "@tiptap/pm/model";
import { collectFootnoteDefinitions, collectFootnoteReferences } from "./Footnotes";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    codeBlock: { group: "block", content: "text*" },
    text: { group: "inline" },
  },
  marks: {},
});

function p(text: string) {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}

function code(text: string) {
  return schema.node("codeBlock", null, text ? [schema.text(text)] : []);
}

function doc(...nodes: ReturnType<typeof p | typeof code>[]) {
  return schema.node("doc", null, nodes);
}

describe("Footnotes", () => {
  it("collects inline footnote references", () => {
    const d = doc(p("One note[^alpha] and another[^2]."));
    const refs = collectFootnoteReferences(d);

    expect(refs).toHaveLength(2);
    expect(d.textBetween(refs[0].from, refs[0].to)).toBe("[^alpha]");
    expect(refs[0].id).toBe("alpha");
    expect(d.textBetween(refs[1].from, refs[1].to)).toBe("[^2]");
    expect(refs[1].id).toBe("2");
  });

  it("collects footnote definitions by paragraph", () => {
    const d = doc(p("[^note]: Footnote body"), p("Regular paragraph"));
    const defs = collectFootnoteDefinitions(d);

    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe("note");
    expect(d.nodeAt(defs[0].from)?.type.name).toBe("paragraph");
  });

  it("does not treat definitions as inline references", () => {
    const d = doc(p("[^note]: Footnote body"));
    expect(collectFootnoteReferences(d)).toEqual([]);
  });

  it("ignores footnote-like syntax inside code blocks", () => {
    const d = doc(code('const note = "[^1]";'), p("Actual ref[^1]"));
    const refs = collectFootnoteReferences(d);

    expect(refs).toHaveLength(1);
    expect(refs[0].id).toBe("1");
    expect(d.textBetween(refs[0].from, refs[0].to)).toBe("[^1]");
  });
});
