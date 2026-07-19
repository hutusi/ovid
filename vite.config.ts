import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

function manualChunks(id: string): string | undefined {
  if (!id.includes("/node_modules/")) return undefined;

  if (
    id.includes("/node_modules/prosemirror-")
  ) {
    return "editor-prosemirror";
  }

  if (id.includes("/node_modules/@tiptap/")) {
    return "editor-tiptap";
  }

  if (
    id.includes("/node_modules/lowlight/") ||
    id.includes("/node_modules/highlight.js/") ||
    id.includes("/node_modules/fault/") ||
    id.includes("/node_modules/hast-util-") ||
    id.includes("/node_modules/mdast-util-") ||
    id.includes("/node_modules/micromark") ||
    id.includes("/node_modules/unified/") ||
    id.includes("/node_modules/unist-")
  ) {
    return "editor-highlight";
  }

  if (id.includes("/node_modules/@tauri-apps/")) {
    return "tauri-vendor";
  }

  if (id.includes("/node_modules/lucide-react/")) {
    return "icon-vendor";
  }

  return undefined;
}

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
    // Vite 8 deprecated the `manualChunks` function form in favour of Rolldown's
    // declarative `codeSplitting` (https://rolldown.rs/reference/OutputOptions.codeSplitting).
    // The function still works and keeps the six named editor/vendor bundles distinct;
    // migrating is a separate rethink and out of scope for the dep sweep.
    rolldownOptions: {
      output: {
        manualChunks,
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
