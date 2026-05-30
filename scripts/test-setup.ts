// happy-dom registration helpers for hook tests.
//
// Opt-in (per-file) rather than `bunfig.toml [test] preload` because Bun
// runs every test file in one process, and a globally-registered `document`
// makes Tiptap/ProseMirror tests take a different code path that produces
// extra trailing paragraphs. Hook test files register in `beforeAll` and
// unregister in `afterAll` so the DOM is scoped to that file only.
//
// See ADR 0012 for the broader testing-strategy rationale.

import { GlobalRegistrator } from "@happy-dom/global-registrator";

export function registerHappyDom(): void {
  if (typeof globalThis.document === "undefined") {
    GlobalRegistrator.register({ url: "http://localhost:3000" });
  }
  // React 18+ logs an `act()` warning for async state updates unless this
  // flag is set by the host environment.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
}

export async function unregisterHappyDom(): Promise<void> {
  if (typeof globalThis.document !== "undefined") {
    await GlobalRegistrator.unregister();
  }
}
