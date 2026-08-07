import type katexApi from "katex";

type KatexApi = typeof katexApi;

// Bare `katex` imports are aliased here (vite.config.ts) so the math
// extension uses the script-injected browser build (loadKatexRuntime.ts)
// instead of bundling KaTeX as a module. Resolution MUST stay lazy: chunking
// can merge this module into a chunk that evaluates at startup, long before
// loadKatexRuntime() has run, and a module-scope throw there kills the whole
// entry bundle (black window). Resolving on first property access instead
// degrades that failure to "math doesn't render" with a console error.
function resolveRuntime(): KatexApi {
  const runtime = globalThis.katex;
  if (!runtime) {
    throw new Error("KaTeX runtime was not loaded before the math extension used it");
  }
  return runtime;
}

export default new Proxy({} as KatexApi, {
  get(_target, prop) {
    const runtime = resolveRuntime();
    const value = Reflect.get(runtime, prop);
    return typeof value === "function" ? value.bind(runtime) : value;
  },
  has(_target, prop) {
    return Reflect.has(resolveRuntime(), prop);
  },
});
