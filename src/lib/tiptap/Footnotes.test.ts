import { describe, expect, it } from "bun:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import {
  buildDecorations,
  collectFootnoteDefinitions,
  collectFootnoteReferences,
  updateDecorations,
} from "./Footnotes";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    codeBlock: { group: "block", content: "text*", marks: "" },
    text: { group: "inline" },
  },
  marks: { strong: {} },
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

describe("Footnotes — incremental updates", () => {
  /** Decorations as comparable strings. */
  function describeSet(set: DecorationSet): string[] {
    return set
      .find()
      .map((d) => {
        const attrs = (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs;
        return `${d.from}-${d.to}:${attrs.class}:${attrs["data-footnote-id"]}`;
      })
      .sort();
  }

  // Deterministic pseudo-random sequence so a failure reproduces.
  function rng(seed: number) {
    let state = seed;
    return (n: number) => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state % n;
    };
  }

  const SNIPPETS = ["[^", "]", "[^a]", "[^b]: ", ": ", "x", " ", "[^note] text", "]:"];

  it("rescans text whose formatting changed", () => {
    const strong = schema.marks.strong;
    // `a` in bold splits the text into three runs, so this isn't a reference.
    let state = EditorState.create({
      doc: doc(
        schema.node("paragraph", null, [
          schema.text("See [^"),
          schema.text("a", [strong.create()]),
          schema.text("] here"),
        ])
      ),
    });
    let decorations = buildDecorations(state.doc);
    expect(describeSet(decorations)).toEqual([]);

    // Removing the bold merges the runs into `[^a]` — no position moves.
    const tr = state.tr.removeMark(1, state.doc.content.size - 1, strong);
    decorations = updateDecorations(decorations, tr);
    state = state.apply(tr);
    expect(describeSet(decorations)).toEqual(describeSet(buildDecorations(state.doc)));
    expect(describeSet(decorations)).toHaveLength(1);
  });

  it("matches a full rebuild after any sequence of edits", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = rng(seed);
      let state = EditorState.create({
        doc: doc(
          p("Intro with a ref[^a] here."),
          p("[^a]: The definition"),
          code("code [^a] ignored"),
          p("Another[^b] and [^c].")
        ),
      });
      let decorations = buildDecorations(state.doc);
      for (let step = 0; step < 25; step++) {
        const size = state.doc.content.size;
        const tr = state.tr;
        const op = random(6);
        const at = 1 + random(Math.max(1, size - 1));
        try {
          if (op === 0) {
            tr.insertText(SNIPPETS[random(SNIPPETS.length)], at);
          } else if (op === 1) {
            const to = Math.min(size, at + 1 + random(6));
            tr.delete(at, to);
          } else if (op === 2) {
            tr.setSelection(TextSelection.create(tr.doc, at));
            tr.split(at);
          } else if (op === 3) {
            const to = Math.min(size, at + random(4));
            tr.insertText(SNIPPETS[random(SNIPPETS.length)], at, to);
          } else {
            // Marks split and merge text runs without moving any position.
            const to = Math.min(size, at + 1 + random(5));
            if (op === 4) tr.addMark(at, to, schema.marks.strong.create());
            else tr.removeMark(at, to, schema.marks.strong);
          }
        } catch {
          continue; // a random position that isn't valid for this step
        }
        if (!tr.docChanged) continue;
        decorations = updateDecorations(decorations, tr);
        state = state.apply(tr);
        expect(describeSet(decorations)).toEqual(describeSet(buildDecorations(state.doc)));
      }
    }
  });
});
