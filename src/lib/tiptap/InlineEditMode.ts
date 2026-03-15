import { Extension } from "@tiptap/core";
import type { Mark, MarkType } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const INLINE_EDIT_KEY = new PluginKey("inlineEditMode");

interface MarkRange {
  from: number;
  to: number;
  mark: Mark;
}

/**
 * Walk backwards/forwards from the cursor to find the full extent of a mark.
 * Bounded to the current paragraph (startBound…endBound).
 */
function getMarkRange(state: EditorState, markType: MarkType): MarkRange | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;

  const startBound = $from.start();
  const endBound = $from.end();

  // Find the active mark at cursor (or one position back for cursor at right edge)
  let activeMark = $from.marks().find((m) => m.type === markType);
  if (!activeMark && $from.pos > startBound) {
    activeMark = state.doc
      .resolve($from.pos - 1)
      .marks()
      .find((m) => m.type === markType);
  }
  if (!activeMark) return null;

  let from = $from.pos;
  while (from > startBound) {
    if (
      !state.doc
        .resolve(from - 1)
        .marks()
        .some((m) => m.type === markType)
    )
      break;
    from--;
  }

  let to = $from.pos;
  while (to < endBound) {
    if (
      !state.doc
        .resolve(to)
        .marks()
        .some((m) => m.type === markType)
    )
      break;
    to++;
  }

  return from < to ? { from, to, mark: activeMark } : null;
}

function widgetAt(pos: number, text: string, cls: string, side: number, key: string): Decoration {
  const span = document.createElement("span");
  span.className = `inline-syntax ${cls}`;
  span.textContent = text;
  span.setAttribute("contenteditable", "false");
  span.setAttribute("aria-hidden", "true");
  return Decoration.widget(pos, () => span, { side, key });
}

function buildDecorations(state: EditorState): DecorationSet {
  const { selection } = state;
  if (!selection.empty) return DecorationSet.empty;

  const { schema } = state;
  const decorations: Decoration[] = [];

  // Bold: **…**
  if (schema.marks.bold) {
    const r = getMarkRange(state, schema.marks.bold);
    if (r) {
      decorations.push(widgetAt(r.from, "**", "inline-syntax-bold", -1, "bold-open"));
      decorations.push(widgetAt(r.to, "**", "inline-syntax-bold", 1, "bold-close"));
    }
  }

  // Italic: _…_
  if (schema.marks.italic) {
    const r = getMarkRange(state, schema.marks.italic);
    if (r) {
      decorations.push(widgetAt(r.from, "_", "inline-syntax-italic", -1, "italic-open"));
      decorations.push(widgetAt(r.to, "_", "inline-syntax-italic", 1, "italic-close"));
    }
  }

  // Link: […](url) — the URL hint is clickable to trigger Cmd+K
  if (schema.marks.link) {
    const r = getMarkRange(state, schema.marks.link);
    if (r) {
      const href = (r.mark.attrs.href as string) || "";
      decorations.push(widgetAt(r.from, "[", "inline-syntax-link", -1, "link-open"));

      const urlSpan = document.createElement("span");
      urlSpan.className = "inline-syntax inline-syntax-link link-url-hint";
      urlSpan.textContent = `](${href})`;
      urlSpan.setAttribute("contenteditable", "false");
      urlSpan.setAttribute("aria-label", "Edit link URL — click or Cmd+K");
      urlSpan.title = "Click to edit URL";
      decorations.push(Decoration.widget(r.to, () => urlSpan, { side: 1, key: "link-close" }));
    }
  }

  if (decorations.length === 0) return DecorationSet.empty;
  return DecorationSet.create(state.doc, decorations);
}

export const InlineEditMode = Extension.create({
  name: "inlineEditMode",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: INLINE_EDIT_KEY,
        state: {
          init(_config, state) {
            return buildDecorations(state);
          },
          apply(tr, prev, _old, newState) {
            if (!tr.docChanged && !tr.selectionSet) return prev;
            return buildDecorations(newState);
          },
        },
        props: {
          decorations(state) {
            return INLINE_EDIT_KEY.getState(state) ?? DecorationSet.empty;
          },
          handleDOMEvents: {
            mousedown(_view, event) {
              const target = event.target as HTMLElement;
              if (!target.classList.contains("link-url-hint")) return false;
              // Prevent blur so the editor stays focused, then open the link dialog
              event.preventDefault();
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});
