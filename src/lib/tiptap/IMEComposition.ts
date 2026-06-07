// IMEComposition: prevent markdown input rules from firing in response to
// an IME composition.
//
// Reported symptom (CJK Pinyin IME): typing `#`, then composing a Chinese
// word, would leave the heading containing the romanized pinyin while the
// committed Chinese characters landed in a new paragraph below it.
//
// Root cause is in `@tiptap/core`'s inputRulesPlugin: on `compositionend`
// it re-runs all input rules at the cursor position via a timeout. With
// CJK IMEs the cursor and surrounding text at that moment can match
// patterns like `# ` even though the user's intent was a Chinese title,
// and the re-run splits the document under the IME's feet.
//
// Fix: register a high-priority `compositionend` handler that returns
// `true`, which short-circuits ProseMirror's handleDOMEvents dispatch so
// Tiptap's input-rules plugin never sees the event. PM's own composition
// reconciliation runs at the browser level (via the `input` event) and is
// unaffected.
//
// We also track composition state in plugin state for any downstream
// extension that wants to behave differently mid-composition.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

interface IMEState {
  composing: boolean;
}

export const imeCompositionKey = new PluginKey<IMEState>("imeComposition");

const META_SET_COMPOSING = "ime/setComposing";

export const IMEComposition = Extension.create({
  name: "imeComposition",
  // Higher priority extensions register their plugins earlier, so our
  // compositionend handler is called before Tiptap's inputRulesPlugin.
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin<IMEState>({
        key: imeCompositionKey,
        state: {
          init: () => ({ composing: false }),
          apply(tr, value) {
            const next = tr.getMeta(META_SET_COMPOSING);
            if (typeof next === "boolean") return { composing: next };
            return value;
          },
        },
        props: {
          handleDOMEvents: {
            compositionstart(view) {
              view.dispatch(view.state.tr.setMeta(META_SET_COMPOSING, true));
              return false;
            },
            // Return true so downstream plugins (specifically Tiptap's
            // inputRulesPlugin) don't run their own compositionend logic.
            // The browser still drives the native composition commit via
            // the input event — that's independent of handleDOMEvents.
            compositionend(view) {
              queueMicrotask(() => {
                if (view.isDestroyed) return;
                view.dispatch(view.state.tr.setMeta(META_SET_COMPOSING, false));
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
