import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

function manualChunks(id: string): string | undefined {
  if (!id.includes("/node_modules/")) return undefined;

  if (
    id.includes("/node_modules/prosemirror-")
  ) {
    return "editor-prosemirror";
  }

  if (
    id.includes("/node_modules/@tiptap/") &&
    !id.includes("/node_modules/@tiptap/extension-mathematics/")
  ) {
    return "editor-tiptap";
  }

  if (
    id.includes("/node_modules/katex/") ||
    id.includes("/node_modules/@tiptap/extension-mathematics/")
  ) {
    return "editor-math";
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

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
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
