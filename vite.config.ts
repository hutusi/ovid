import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Named vendor chunks, as Rolldown code-splitting groups. A group also captures
// its modules' dependencies, and a higher `priority` claims a module first —
// which is the point of the order here:
//
// - React is claimed before the editor groups. Otherwise editor-tiptap
//   captures it (React is a dependency of @tiptap/react), the entry imports
//   React from there, and index.html preloads and evaluates the whole editor
//   vendor set (~750 KiB) at startup despite the lazy-loaded Editor.
//   scripts/check-bundle-size.ts fails the build if that regresses.
// - The editor groups load with the lazy Editor. editor-tiptap includes
//   extension-mathematics, whose aliased `katex` import
//   (src/lib/katexGlobal.ts) must stay free of module-scope side effects.
//   Don't split mathematics into its own chunk: group capture drags shared
//   prosemirror/tiptap modules along. scripts/check-entry-evaluates.ts
//   smoke-tests the built entry against this class of startup crash.
const nodeModule = (pattern: string) => new RegExp(`[\\/]node_modules[\\/](?:${pattern})`);

const codeSplittingGroups = [
  {
    name: "react-vendor",
    test: nodeModule("react[\\/]|react-dom[\\/]|scheduler[\\/]|use-sync-external-store[\\/]"),
    priority: 50,
  },
  { name: "tauri-vendor", test: nodeModule("@tauri-apps[\\/]"), priority: 40 },
  { name: "icon-vendor", test: nodeModule("lucide-react[\\/]"), priority: 40 },
  { name: "editor-prosemirror", test: nodeModule("prosemirror-"), priority: 30 },
  { name: "editor-tiptap", test: nodeModule("@tiptap[\\/]"), priority: 20 },
  {
    name: "editor-highlight",
    test: nodeModule(
      "lowlight[\\/]|highlight\\.js[\\/]|fault[\\/]|hast-util-|mdast-util-|micromark|unified[\\/]|unist-"
    ),
    priority: 10,
  },
];

// KaTeX ships every font face as woff2 + woff + ttf (~60 files); Tauri's
// WebViews (WKWebView / WebView2) always support woff2, so the woff/ttf
// fallbacks are dead weight in the app bundle. Drop them at emit time — the
// CSS still lists them as fallback sources, but they are never requested.
function pruneKatexFontFallbacks() {
  return {
    name: "prune-katex-font-fallbacks",
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      for (const name of Object.keys(bundle)) {
        if (/KaTeX_.*\.(woff|ttf)$/.test(name)) delete bundle[name];
      }
    },
  };
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react(), pruneKatexFontFallbacks()],

  resolve: {
    alias: [
      {
        find: "@",
        replacement: resolve(__dirname, "./src"),
      },
      {
        find: /^katex$/,
        replacement: resolve(__dirname, "./src/lib/katexGlobal.ts"),
      },
    ],
  },
  build: {
    // Rolldown's declarative code splitting (https://rolldown.rs/reference/OutputOptions.codeSplitting).
    rolldownOptions: {
      output: {
        codeSplitting: { groups: codeSplittingGroups },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
