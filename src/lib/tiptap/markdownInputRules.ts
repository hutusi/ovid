// CJK-friendly markdown input rules for inline marks.
//
// StarterKit ships Bold/Italic/Strike with regexes that require `(?:^|\s)`
// before `**`/`*`/`~~`, which means the shortcut never fires when typed
// immediately after a non-whitespace character — Chinese/Japanese/Korean
// prose almost always falls into that case. These extensions drop the
// whitespace prefix and add negative lookbehind/lookahead guards so italic
// doesn't prematurely fire on the `**word*` intermediate state of a bold
// typing sequence.
//
// See `src/lib/tiptap/markdownInputRules.test.ts` for behaviour coverage
// (including the bold-vs-italic non-conflict) and ADR 0015 for the IME
// composition story that wraps around these rules.

import { markInputRule } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";

export const BoldWithMarkdownShortcut = Bold.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(\*\*(?!\s+\*\*)([^*]+)\*\*(?!\s+\*\*))$/,
        type: this.type,
      }),
      markInputRule({
        find: /(__(?!\s+__)([^_]+)__(?!\s+__))$/,
        type: this.type,
      }),
    ];
  },
});

export const ItalicWithMarkdownShortcut = Italic.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?<!\*)\*(?!\*)([^*\s][^*]*?)\*(?!\*)$/,
        type: this.type,
      }),
      markInputRule({
        find: /(?<!_)_(?!_)([^_\s][^_]*?)_(?!_)$/,
        type: this.type,
      }),
    ];
  },
});

export const StrikeWithMarkdownShortcut = Strike.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(~~(?!\s+~~)([^~]+)~~(?!\s+~~))$/,
        type: this.type,
      }),
    ];
  },
});
