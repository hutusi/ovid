import katexRuntimeUrl from "katex/dist/katex.min.js?url";

let pendingLoad: Promise<void> | null = null;

/**
 * Load KaTeX's pre-minified browser build just before the editor is imported.
 * Keeping the generated parser tables as an opaque asset avoids making the
 * application bundler parse and re-emit them as a much larger module.
 */
export function loadKatexRuntime(): Promise<void> {
  if (globalThis.katex) return Promise.resolve();
  if (pendingLoad) return pendingLoad;

  pendingLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = katexRuntimeUrl;
    script.async = true;
    script.dataset.ovidKatexRuntime = "true";
    script.addEventListener(
      "load",
      () => {
        if (globalThis.katex) {
          resolve();
          return;
        }
        pendingLoad = null;
        reject(new Error("KaTeX runtime loaded without exposing its browser API"));
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        pendingLoad = null;
        script.remove();
        reject(new Error("Unable to load the KaTeX runtime"));
      },
      { once: true }
    );
    document.head.append(script);
  });

  return pendingLoad;
}
