import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const FOLD_KEY = new PluginKey<FoldState>("textFolding");

interface FoldState {
  folded: ReadonlySet<number>;
  decorations: DecorationSet;
}

export interface HeadingRange {
  headingFrom: number;
  headingTo: number;
  contentFrom: number;
  contentTo: number;
  level: number;
}

/** Collect top-level heading ranges: each heading + the blocks under it until the next heading of same/higher level. */
export function getHeadingRanges(doc: Node): HeadingRange[] {
  const headings: Array<{ pos: number; level: number; nodeSize: number }> = [];
  doc.forEach((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({ pos, level: node.attrs.level as number, nodeSize: node.nodeSize });
    }
  });

  return headings.flatMap((h, i) => {
    let contentTo = doc.content.size;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        contentTo = headings[j].pos;
        break;
      }
    }
    const contentFrom = h.pos + h.nodeSize;
    if (contentFrom >= contentTo) return [];
    return [
      { headingFrom: h.pos, headingTo: h.pos + h.nodeSize, contentFrom, contentTo, level: h.level },
    ];
  });
}

function buildDecorations(doc: Node, folded: ReadonlySet<number>): DecorationSet {
  const ranges = getHeadingRanges(doc);
  if (ranges.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  // Build sorted list of folded content intervals for a single-pass node walk
  const foldedIntervals = ranges
    .filter((r) => folded.has(r.headingFrom))
    .map((r) => ({ from: r.contentFrom, to: r.contentTo }));

  for (const range of ranges) {
    const isFolded = folded.has(range.headingFrom);

    // Heading node gets a class so CSS can set position:relative for the widget
    decorations.push(
      Decoration.node(range.headingFrom, range.headingTo, {
        class: `foldable${isFolded ? " fold-closed" : " fold-open"}`,
      })
    );

    // Chevron widget — placed just before the heading's first text character
    const chevron = document.createElement("span");
    chevron.className = "fold-chevron";
    chevron.setAttribute("contenteditable", "false");
    chevron.setAttribute("role", "button");
    chevron.setAttribute("tabindex", "0");
    chevron.setAttribute("data-fold-pos", String(range.headingFrom));
    chevron.setAttribute("aria-label", isFolded ? "Expand section" : "Collapse section");
    decorations.push(
      Decoration.widget(range.headingFrom + 1, chevron, {
        side: -1,
        key: `chevron-${range.headingFrom}`,
        // biome-ignore lint/suspicious/noExplicitAny: ProseMirror widget spec
        marks: [] as any,
      })
    );
  }

  // Single pass over top-level nodes to hide content under folded headings
  if (foldedIntervals.length > 0) {
    doc.forEach((node, pos) => {
      const end = pos + node.nodeSize;
      for (const interval of foldedIntervals) {
        if (pos >= interval.from && end <= interval.to) {
          decorations.push(
            Decoration.node(pos, end, {
              style: "display:none; height:0; overflow:hidden; padding:0; margin:0;",
            })
          );
          break; // a node can only be inside one folded interval
        }
      }
    });
  }

  return DecorationSet.create(doc, decorations);
}

export const TextFolding = Extension.create({
  name: "textFolding",

  addProseMirrorPlugins() {
    return [
      new Plugin<FoldState>({
        key: FOLD_KEY,
        state: {
          init(_config, state) {
            const folded = new Set<number>();
            return { folded, decorations: buildDecorations(state.doc, folded) };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(FOLD_KEY) as { togglePos: number } | undefined;

            let folded: ReadonlySet<number>;
            if (meta?.togglePos !== undefined) {
              const next = new Set(prev.folded);
              if (next.has(meta.togglePos)) {
                next.delete(meta.togglePos);
              } else {
                next.add(meta.togglePos);
              }
              folded = next;
            } else if (tr.docChanged) {
              const next = new Set<number>();
              for (const pos of prev.folded) {
                const result = tr.mapping.mapResult(pos);
                if (!result.deleted && result.pos >= 0) next.add(result.pos);
              }
              folded = next;
            } else {
              folded = prev.folded;
            }

            return { folded, decorations: buildDecorations(tr.doc, folded) };
          },
        },
        props: {
          decorations(state) {
            return FOLD_KEY.getState(state)?.decorations ?? DecorationSet.empty;
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const target = event.target as HTMLElement;
              if (!target.classList.contains("fold-chevron")) return false;
              event.preventDefault();
              const pos = Number(target.getAttribute("data-fold-pos"));
              if (Number.isNaN(pos)) return false;
              view.dispatch(
                view.state.tr.setMeta(FOLD_KEY, { togglePos: pos }).setMeta("addToHistory", false)
              );
              return true;
            },
            keydown(view, event) {
              const target = event.target as HTMLElement;
              if (!target.classList.contains("fold-chevron")) return false;
              if (event.key !== "Enter" && event.key !== " ") return false;
              event.preventDefault();
              const pos = Number(target.getAttribute("data-fold-pos"));
              if (Number.isNaN(pos)) return false;
              view.dispatch(
                view.state.tr.setMeta(FOLD_KEY, { togglePos: pos }).setMeta("addToHistory", false)
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});
