import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FrontmatterValue } from "../../lib/frontmatter";
import { resolveImageExtension, resolveImageSrc, toAssetRootRelative } from "../../lib/imageUtils";
import { EditableValue } from "./EditableValue";
import { RemoveFieldButton } from "./RemoveFieldButton";

const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

async function uploadImageBytes(file: File, filePath: string | undefined): Promise<string> {
  const ext = resolveImageExtension(file);
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  return invoke<string>("save_asset_from_bytes", {
    bytes,
    extension: ext,
    activeFilePath: filePath,
  });
}

export function CoverImageField({
  value,
  previewVisible,
  filePath,
  assetRoot,
  cdnBase,
  onTogglePreview,
  onSave,
  onRemove,
  onError,
}: {
  value: string;
  previewVisible: boolean;
  filePath?: string;
  assetRoot?: string;
  cdnBase?: string;
  onTogglePreview: () => void;
  onSave: (v: FrontmatterValue) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const dropRef = useRef<HTMLFieldSetElement>(null);

  const trimmed = value.trim();
  const hasValue = trimmed.length > 0;
  const thumbSrc = hasValue ? resolveImageSrc(trimmed, filePath, assetRoot, cdnBase) : "";
  const thumbBroken = brokenSrc !== null && brokenSrc === thumbSrc;

  async function handleFile(file: File) {
    if (!IMAGE_MIME_RE.test(file.type)) {
      onError?.(t("properties.cover_invalid_type"));
      return;
    }
    setBusy(true);
    try {
      const relPath = await uploadImageBytes(file, filePath);
      onSave(relPath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onError?.(t("properties.cover_save_error", { reason }));
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseFile() {
    setBusy(true);
    try {
      const srcPath = await invoke<string | null>("pick_image_file");
      if (!srcPath) return;

      const rootRelative = toAssetRootRelative(srcPath, assetRoot);
      if (rootRelative !== null) {
        onSave(rootRelative);
        return;
      }

      const relPath = await invoke<string>("save_asset", {
        srcPath,
        activeFilePath: filePath,
      });
      onSave(relPath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onError?.(t("properties.cover_save_error", { reason }));
    } finally {
      setBusy(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (Array.from(e.dataTransfer.items).some((item) => IMAGE_MIME_RE.test(item.type))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragActive(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!dropRef.current?.contains(e.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    setDragActive(false);
    const file = Array.from(e.dataTransfer.files).find((f) => IMAGE_MIME_RE.test(f.type));
    if (!file) return;
    e.preventDefault();
    void handleFile(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(
      (i) => i.kind === "file" && IMAGE_MIME_RE.test(i.type)
    );
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void handleFile(file);
  }

  const dropZoneClass = [
    "prop-cover-dropzone",
    hasValue ? "is-populated" : "is-empty",
    dragActive ? "is-drag-active" : "",
    busy ? "is-busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="prop-field">
      <div className="prop-field-head">
        <span className="prop-label">{t("properties.cover_image")}</span>
        <div className="prop-field-actions">
          <button
            type="button"
            className="prop-cover-eye-btn"
            aria-label={previewVisible ? t("properties.cover_hide") : t("properties.cover_show")}
            aria-pressed={previewVisible}
            onClick={onTogglePreview}
          >
            <EyeIcon open={previewVisible} />
          </button>
          <RemoveFieldButton label={t("properties.cover_image")} onRemove={onRemove} />
        </div>
      </div>

      <fieldset
        ref={dropRef}
        className={dropZoneClass}
        aria-label={t("properties.cover_dropzone_label")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: must be focusable so paste events fire here
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {hasValue && !thumbBroken ? (
          <img
            className="prop-cover-thumb"
            src={thumbSrc}
            alt={t("properties.cover_image")}
            onError={() => setBrokenSrc(thumbSrc)}
          />
        ) : (
          <div className="prop-cover-empty">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="prop-cover-empty-msg">
              {hasValue ? t("properties.cover_unavailable") : t("properties.cover_dropzone_hint")}
            </span>
          </div>
        )}

        <div className="prop-cover-actions">
          <button
            type="button"
            className="prop-cover-action-btn"
            disabled={busy}
            onClick={handleChooseFile}
          >
            {busy ? t("properties.cover_saving") : t("properties.cover_choose")}
          </button>
        </div>
      </fieldset>

      <EditableValue label={t("properties.cover_path")} value={value} onSave={onSave} />
    </div>
  );
}
