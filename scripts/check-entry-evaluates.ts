// Evaluate the built entry chunk under happy-dom and fail if module
// evaluation throws.
//
// `bun run validate` builds the production bundle but nothing ever executed
// it, so a module-scope throw that only exists in the bundled output could
// ship unnoticed — chunking merged @tiptap/extension-mathematics into the
// eagerly-loaded Tiptap chunk, its aliased `katex` import (katexGlobal.ts)
// threw at import time because loadKatexRuntime() hadn't run yet, and the
// packaged app launched to a black window while dev (unbundled ESM, lazy
// evaluation) stayed green. This smoke test catches that whole class: any
// startup crash during entry evaluation, whatever chunk layout caused it.
//
// Scope is deliberately module evaluation only. The app's async work (Tauri
// invokes, listeners) legitimately rejects outside the Tauri shell, so
// unhandled rejections are tolerated and the process exits as soon as the
// import settles.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHappyDom } from "./test-setup";

const assetsDirectory = join(import.meta.dir, "..", "dist", "assets");
const entryName = readdirSync(assetsDirectory).find((name) => /^index-[^.]+\.js$/.test(name));
if (!entryName) {
  console.error("entry smoke test: no chunk matching index-*.js in dist/assets — run vite build first");
  process.exit(1);
}

process.on("unhandledRejection", () => {
  // Expected outside the Tauri shell (invoke/listen have no backend).
});

registerHappyDom();
document.body.innerHTML = '<div id="root"></div>';

try {
  await import(pathToFileURL(join(assetsDirectory, entryName)).href);
} catch (error) {
  console.error(`entry smoke test: ${entryName} threw during module evaluation — a packaged app would launch to a dead window\n`);
  console.error(error);
  process.exit(1);
}

console.log(`entry smoke test: ${entryName} evaluated cleanly`);
process.exit(0);
