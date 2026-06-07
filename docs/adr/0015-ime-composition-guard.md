# ADR 0015 — IME composition guard for markdown input rules

**Status:** Accepted
**Date:** 2026-06
**Implementing commits:**
- `ae7be4e` — fix(editor): prevent IME composition from triggering markdown input rules
- `1a52678` — test(editor): add diagnostic tests for bold/italic markdown input rules

## Context

Tiptap (via `@tiptap/core` v3.23) registers an internal `inputRulesPlugin`
for every extension that defines `addInputRules()`. That plugin has *two*
trigger paths:

1. `handleTextInput` — fires synchronously for every literal keystroke.
2. `handleDOMEvents.compositionend` — runs the same input-rule machinery
   at the cursor on a deferred `setTimeout` after a composition ends.

The compositionend re-run exists to support input rules that depend on
characters committed by an IME. In practice it triggers a CJK-IME bug
that's both common and very confusing:

A user types `#`, opens a Pinyin IME, composes `测试` (typing pinyin
letters), and presses space to pick the candidate. The space character is
consumed by the IME — it never reaches ProseMirror as text. But Tiptap's
deferred compositionend handler re-runs input rules at the cursor against
the document state that *now contains the committed Chinese characters*,
and one of the rules (heading `# `) sees `# 测试` and splits the paragraph
into an H1 + a stray paragraph. Net result: the title is the romanized
pinyin keystrokes that briefly appeared during composition, and the
committed Chinese text lives in a new paragraph below.

The same class of bug applies to any structural rule (`# `, `## `, `- `,
`1. `, `> `, `\`\`\` `, etc.) whose pattern could be matched by the text
adjacent to the cursor after an IME commit.

## Decision

**A dedicated extension, `IMEComposition` (see `src/lib/tiptap/IMEComposition.ts`),
registers a ProseMirror plugin with `priority: 1000` whose
`compositionend` handler returns `true` — short-circuiting ProseMirror's
`handleDOMEvents` dispatch so Tiptap's `inputRulesPlugin.compositionend`
never runs.**

The extension also exposes a plugin-state `composing: boolean` flag (via
`imeCompositionKey`) so downstream extensions can branch on composition
state if they ever need to.

Native composition commit is *not* affected by this — the browser drives
the final text insertion through a separate `input` event, which is a
different code path from `handleDOMEvents.compositionend`. The marks and
nodes the user actually typed before composition are preserved.

## Trade-off

This is a broad-spectrum suppression. It blocks the compositionend rule
re-run **for every extension** — not just the heading rule that was the
reported symptom. That's intentional: every structural rule has the same
class of bug, and there is no clean way to selectively replay only the
rules the user "meant." The cost is one specific narrow case: if a user
*intentionally* relies on an input rule firing on text that only exists
after an IME commit (e.g. composes `# ` via an IME — unlikely, since
`#`/space are typically typed as ASCII), the rule will no longer fire on
compositionend. They can still trigger it manually with one more keystroke.

The flag-based composing state means future selective overrides are
possible without ripping this plugin out.

## Why this shape, not the alternatives

- **`filterTransaction` checking an `inputRule` meta tag** — the meta key
  is the inputRulesPlugin's anonymous Plugin instance, which is created
  per-editor and not exported. A `tr.getMeta("inputRule")` lookup misses
  Tiptap's real tag. We started with this in the implementation plan and
  switched to `handleDOMEvents` after reading `@tiptap/core` source.
- **Disabling `Heading` and re-registering with a composition-aware rule** —
  surgical for the one reported case but doesn't address the analogous bug
  in lists, blockquotes, code-fences, or any future input rule contributed
  by an extension we don't control.
- **Bumping the IME extension's priority lower than 1000** — would put it
  after Tiptap's inputRulesPlugin in dispatch order, so `compositionend`
  reaches the input-rules plugin before our handler can claim it. The
  plugin order is set by extension priority at editor build time; 1000 is
  well above the default 100 and any current StarterKit value.

## Validation

`src/lib/tiptap/IMEComposition.test.ts` covers the state transitions
(composition start sets the flag, composition end clears it on the next
microtask). The behavioural assertion — that the heading rule does not
fire after a composition — is left to the manual verification step in the
PR test plan; reliably simulating a composition through happy-dom +
Tiptap's input-rules plugin requires more scaffolding than the bug
warrants.

## Related

`src/lib/tiptap/markdownInputRules.test.ts` is the diagnostic harness
proving bold/italic/link rules fire correctly through normal typing —
the path this guard does *not* touch. If that harness ever needs to
verify composition-time behaviour, the `imeCompositionKey` plugin state
is the supported way to drive a synthetic composition through it.
