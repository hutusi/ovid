import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FileNode } from "../lib/types";
import "./FileViewer.css";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
const TEXT_EXTS = new Set([
  "txt",
  "md",
  "mdx",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "yaml",
  "yml",
  "toml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "rs",
  "py",
  "go",
  "rb",
  "sh",
  "bash",
  "zsh",
  "fish",
  "lua",
  "vim",
  "xml",
  "csv",
  "ini",
  "conf",
  "config",
  "env",
  "lock",
  "vue",
  "svelte",
  "kt",
  "swift",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "gitignore",
  "gitattributes",
  "editorconfig",
  "prettierrc",
  "eslintrc",
]);

export type FileViewKind = "image" | "text";

export function getFileViewKind(node: FileNode): FileViewKind | null {
  const raw = node.extension?.replace(".", "") ?? node.name.split(".").pop() ?? "";
  const ext = raw.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  return null;
}

interface FileViewerProps {
  node: FileNode;
  onClose: () => void;
}

export function FileViewer({ node, onClose }: FileViewerProps) {
  const { t } = useTranslation();
  const kind = getFileViewKind(node);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "text") return;
    setLoading(true);
    setContent(null);
    setError(null);
    invoke<string>("read_file", { path: node.path })
      .then((c) => setContent(c))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [node.path, kind]);

  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <span className="file-viewer-name">{node.name}</span>
        <button
          type="button"
          className="file-viewer-close"
          onClick={onClose}
          aria-label={t("file_viewer.close")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="file-viewer-body">
        {kind === "image" && (
          <div className="file-viewer-image-wrap">
            <img
              src={convertFileSrc(node.path)}
              alt={t("file_viewer.image_alt", { name: node.name })}
              className="file-viewer-image"
            />
          </div>
        )}
        {kind === "text" && loading && (
          <div className="file-viewer-placeholder">{t("file_viewer.loading")}</div>
        )}
        {kind === "text" && error && (
          <div className="file-viewer-placeholder file-viewer-error">{error}</div>
        )}
        {kind === "text" && !loading && content !== null && (
          <pre className="file-viewer-text">
            <code>{content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
