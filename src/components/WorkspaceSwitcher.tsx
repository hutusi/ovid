import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ChevronLeft, FolderPlus, GitBranch, MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CloneProgress } from "../lib/commands/generated/CloneProgress";
import { listenEvent } from "../lib/commands/internal";
import type { RecentWorkspace } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./WorkspaceSwitcher.css";

/** Hard-coded starter for the "From Amytis starter" template option. */
const AMYTIS_STARTER_URL = "https://github.com/hutusi/amytis-starter.git";

type View = { kind: "list" } | { kind: "create" } | { kind: "clone"; initialUrl?: string };

interface WorkspaceSwitcherProps {
  recentWorkspaces: RecentWorkspace[];
  currentRootPath: string | null;
  /** Select a recent workspace by root path. */
  onSelect: (rootPath: string) => void;
  /** Open a native folder picker, then load that folder as a workspace. */
  onOpenOther: () => void;
  /** Remove a recent entry (does NOT touch the filesystem). */
  onRemoveRecent: (rootPath: string) => void;
  /** Scaffold a brand-new Amytis workspace; resolves true on success. */
  onCreate: (parentDir: string, name: string) => Promise<boolean>;
  /** Clone a remote workspace; resolves true on success. */
  onClone: (url: string, parentDir: string, name: string | null) => Promise<boolean>;
  /** Surface a toast (used for "Copied", "Removed", etc.). */
  onToast: (message: string) => void;
  onClose: () => void;
}

export function WorkspaceSwitcher({
  recentWorkspaces,
  currentRootPath,
  onSelect,
  onOpenOther,
  onRemoveRecent,
  onCreate,
  onClone,
  onToast,
  onClose,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const [view, setView] = useState<View>({ kind: "list" });

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("workspace_switcher.title")}
        className="modal-panel ws-panel"
        onKeyDown={handleKeyDown}
      >
        {view.kind === "list" && (
          <ListView
            recentWorkspaces={recentWorkspaces}
            currentRootPath={currentRootPath}
            onSelect={onSelect}
            onOpenOther={onOpenOther}
            onRemoveRecent={onRemoveRecent}
            onToast={onToast}
            onClose={onClose}
            onGoCreate={() => setView({ kind: "create" })}
            onGoClone={() => setView({ kind: "clone" })}
          />
        )}
        {view.kind === "create" && (
          <CreateView
            onBack={() => setView({ kind: "list" })}
            onCreate={onCreate}
            onCloneStarter={(parentDir, name) => onClone(AMYTIS_STARTER_URL, parentDir, name)}
            onSuccess={(name) => {
              onToast(t("workspace_switcher.toast_created", { name }));
              onClose();
            }}
          />
        )}
        {view.kind === "clone" && (
          <CloneView
            initialUrl={view.initialUrl}
            onBack={() => setView({ kind: "list" })}
            onClone={onClone}
            onSuccess={(name) => {
              onToast(t("workspace_switcher.toast_cloned", { name }));
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────

interface ListViewProps {
  recentWorkspaces: RecentWorkspace[];
  currentRootPath: string | null;
  onSelect: (rootPath: string) => void;
  onOpenOther: () => void;
  onRemoveRecent: (rootPath: string) => void;
  onToast: (message: string) => void;
  onClose: () => void;
  onGoCreate: () => void;
  onGoClone: () => void;
}

function ListView({
  recentWorkspaces,
  currentRootPath,
  onSelect,
  onOpenOther,
  onRemoveRecent,
  onToast,
  onClose,
  onGoCreate,
  onGoClone,
}: ListViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <p className="modal-title">{t("workspace_switcher.title")}</p>

      <ul className="ws-list" aria-label={t("workspace_switcher.recent_heading")}>
        {recentWorkspaces.map((w) => (
          <RecentItem
            key={w.rootPath}
            workspace={w}
            isCurrent={w.rootPath === currentRootPath}
            onSelect={() => {
              if (w.rootPath !== currentRootPath) onSelect(w.rootPath);
              onClose();
            }}
            onRemove={() => {
              onRemoveRecent(w.rootPath);
              onToast(t("workspace_switcher.toast_removed", { name: w.name }));
            }}
            onReveal={async () => {
              try {
                await revealItemInDir(w.rootPath);
              } catch (err) {
                onToast(
                  t("errors.reveal_failed", {
                    message: err instanceof Error ? err.message : String(err),
                  })
                );
              }
            }}
            onCopyPath={async () => {
              try {
                await navigator.clipboard.writeText(w.rootPath);
                onToast(t("workspace_switcher.toast_copied"));
              } catch (err) {
                onToast(
                  t("errors.copy_path_failed", {
                    message: err instanceof Error ? err.message : String(err),
                  })
                );
              }
            }}
          />
        ))}
        {recentWorkspaces.length === 0 && (
          <li className="ws-empty">{t("workspace_switcher.no_recent")}</li>
        )}
      </ul>

      <div className="modal-actions">
        <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
          {t("workspace_switcher.cancel")}
        </button>
        <div className="modal-spacer" />
        <button type="button" className="modal-btn" onClick={onGoClone}>
          {t("workspace_switcher.clone")}
        </button>
        <button type="button" className="modal-btn" onClick={onGoCreate}>
          {t("workspace_switcher.create_new")}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={() => {
            onOpenOther();
            onClose();
          }}
        >
          {t("workspace_switcher.open_folder")}
        </button>
      </div>
    </>
  );
}

// ── Recent item with overflow menu ───────────────────────────────────────

interface RecentItemProps {
  workspace: RecentWorkspace;
  isCurrent: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
}

function RecentItem({
  workspace,
  isCurrent,
  onSelect,
  onRemove,
  onReveal,
  onCopyPath,
}: RecentItemProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLLIElement | null>(null);

  // Close on outside click + Escape. Plain-CSS popover pattern from
  // FontSettings/CodeBlockView (no Portal — fits the Tauri WebView rule).
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <li ref={containerRef} className={`ws-item${isCurrent ? " ws-item--active" : ""}`}>
      <div className="ws-item-header">
        <button type="button" className="ws-item-button" onClick={onSelect}>
          <span className="ws-item-name">{workspace.name}</span>
          <span className="ws-item-path">{workspace.rootPath}</span>
        </button>
        <div className="ws-item-controls">
          {isCurrent && (
            <span className="ws-item-badge ws-item-badge--inline">
              {t("workspace_switcher.current")}
            </span>
          )}
          <button
            type="button"
            className={`ws-overflow-btn${menuOpen ? " is-open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label={t("workspace_switcher.item_menu")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="ws-actions-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="ws-actions-menu-btn"
            onClick={() => {
              setMenuOpen(false);
              onReveal();
            }}
          >
            {t("workspace_switcher.item_reveal")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="ws-actions-menu-btn"
            onClick={() => {
              setMenuOpen(false);
              onCopyPath();
            }}
          >
            {t("workspace_switcher.item_copy_path")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="ws-actions-menu-btn ws-actions-menu-btn--danger"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
          >
            {t("workspace_switcher.item_remove")}
          </button>
        </div>
      )}
    </li>
  );
}

// ── Create view ──────────────────────────────────────────────────────────

type CreateTemplate = "stub" | "starter";

interface CreateViewProps {
  onBack: () => void;
  onCreate: (parentDir: string, name: string) => Promise<boolean>;
  onCloneStarter: (parentDir: string, name: string | null) => Promise<boolean>;
  onSuccess: (name: string) => void;
}

function CreateView({ onBack, onCreate, onCloneStarter, onSuccess }: CreateViewProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [template, setTemplate] = useState<CreateTemplate>("stub");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const nameId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  function nameIsValid(value: string) {
    const trimmed = value.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.includes("/") &&
      !trimmed.includes("\\") &&
      !trimmed.startsWith(".")
    );
  }

  async function pickParent() {
    try {
      const picked = await openFolderDialog({ directory: true, multiple: false });
      if (typeof picked === "string") setParentDir(picked);
    } catch {
      // User cancelled — leave parentDir alone.
    }
  }

  async function submit() {
    setError(null);
    if (!nameIsValid(name)) {
      setError(t("workspace_switcher.error_name_invalid"));
      return;
    }
    if (!parentDir) {
      setError(t("workspace_switcher.error_parent_required"));
      return;
    }
    const trimmedName = name.trim();
    setWorking(true);
    const ok =
      template === "stub"
        ? await onCreate(parentDir, trimmedName)
        : await onCloneStarter(parentDir, trimmedName);
    setWorking(false);
    if (ok) onSuccess(trimmedName);
  }

  return (
    <>
      <div className="ws-view-header">
        <button
          type="button"
          className="ws-back-btn"
          onClick={onBack}
          aria-label={t("workspace_switcher.back")}
          disabled={working}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <p className="modal-title ws-view-title">
          <FolderPlus size={14} aria-hidden="true" />
          {t("workspace_switcher.create_title")}
        </p>
      </div>

      <div className="ws-form">
        <label className="ws-form-row" htmlFor={nameId}>
          <span className="ws-form-label">{t("workspace_switcher.create_name_label")}</span>
          <input
            ref={nameInputRef}
            id={nameId}
            type="text"
            className="ws-form-input"
            value={name}
            placeholder={t("workspace_switcher.create_name_placeholder")}
            onChange={(e) => setName(e.target.value)}
            disabled={working}
          />
        </label>

        <div className="ws-form-row">
          <span className="ws-form-label">{t("workspace_switcher.create_parent_label")}</span>
          <div className="ws-form-picker">
            <span className="ws-form-picker-path" title={parentDir ?? undefined}>
              {parentDir ?? t("workspace_switcher.create_parent_placeholder")}
            </span>
            <button
              type="button"
              className="ws-form-picker-btn"
              onClick={pickParent}
              disabled={working}
              aria-label={`${t("workspace_switcher.create_parent_label")}: ${
                parentDir ?? t("workspace_switcher.create_pick_parent")
              }`}
            >
              {t("workspace_switcher.create_pick_parent")}
            </button>
          </div>
        </div>

        <fieldset className="ws-form-row ws-form-fieldset">
          <legend className="ws-form-label">{t("workspace_switcher.create_template_label")}</legend>
          <label className="ws-template-option">
            <input
              type="radio"
              name="template"
              value="stub"
              checked={template === "stub"}
              onChange={() => setTemplate("stub")}
              disabled={working}
            />
            <span>
              <span className="ws-template-name">
                {t("workspace_switcher.create_template_stub")}
              </span>
              <span className="ws-template-hint">
                {t("workspace_switcher.create_template_stub_hint")}
              </span>
            </span>
          </label>
          <label className="ws-template-option">
            <input
              type="radio"
              name="template"
              value="starter"
              checked={template === "starter"}
              onChange={() => setTemplate("starter")}
              disabled={working}
            />
            <span>
              <span className="ws-template-name">
                {t("workspace_switcher.create_template_repo")}
              </span>
              <span className="ws-template-hint">
                {t("workspace_switcher.create_template_repo_hint")}
              </span>
            </span>
          </label>
        </fieldset>

        {error && (
          <p className="ws-form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="modal-btn modal-btn-cancel"
          onClick={onBack}
          disabled={working}
        >
          {t("workspace_switcher.back")}
        </button>
        <div className="modal-spacer" />
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={submit}
          disabled={working || !nameIsValid(name) || !parentDir}
        >
          {working ? t("workspace_switcher.create_working") : t("workspace_switcher.create_submit")}
        </button>
      </div>
    </>
  );
}

// ── Clone view ───────────────────────────────────────────────────────────

interface CloneViewProps {
  initialUrl?: string;
  onBack: () => void;
  onClone: (url: string, parentDir: string, name: string | null) => Promise<boolean>;
  onSuccess: (name: string) => void;
}

function CloneView({ initialUrl, onBack, onClone, onSuccess }: CloneViewProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const urlId = useId();
  const folderId = useId();
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!working) return;
    const unlisten = listenEvent<CloneProgress>("workspace_clone_progress", (p) => {
      setProgress(p);
    });
    return unlisten;
  }, [working]);

  async function pickParent() {
    try {
      const picked = await openFolderDialog({ directory: true, multiple: false });
      if (typeof picked === "string") setParentDir(picked);
    } catch {
      // Cancelled.
    }
  }

  async function submit() {
    setError(null);
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError(t("workspace_switcher.error_url_invalid"));
      return;
    }
    if (!parentDir) {
      setError(t("workspace_switcher.error_parent_required"));
      return;
    }
    const trimmedFolder = folderName.trim();
    const submittedName: string | null = trimmedFolder.length > 0 ? trimmedFolder : null;
    setProgress(null);
    setWorking(true);
    const ok = await onClone(trimmedUrl, parentDir, submittedName);
    setWorking(false);
    if (ok) {
      const displayName = submittedName ?? deriveDisplayNameFromUrl(trimmedUrl) ?? trimmedUrl;
      onSuccess(displayName);
    }
  }

  return (
    <>
      <div className="ws-view-header">
        <button
          type="button"
          className="ws-back-btn"
          onClick={onBack}
          aria-label={t("workspace_switcher.back")}
          disabled={working}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <p className="modal-title ws-view-title">
          <GitBranch size={14} aria-hidden="true" />
          {t("workspace_switcher.clone_title")}
        </p>
      </div>

      <div className="ws-form">
        <label className="ws-form-row" htmlFor={urlId}>
          <span className="ws-form-label">{t("workspace_switcher.clone_url_label")}</span>
          <input
            ref={urlInputRef}
            id={urlId}
            type="text"
            className="ws-form-input"
            value={url}
            placeholder={t("workspace_switcher.clone_url_placeholder")}
            onChange={(e) => setUrl(e.target.value)}
            disabled={working}
            spellCheck={false}
          />
        </label>

        <div className="ws-form-row">
          <span className="ws-form-label">{t("workspace_switcher.create_parent_label")}</span>
          <div className="ws-form-picker">
            <span className="ws-form-picker-path" title={parentDir ?? undefined}>
              {parentDir ?? t("workspace_switcher.create_parent_placeholder")}
            </span>
            <button
              type="button"
              className="ws-form-picker-btn"
              onClick={pickParent}
              disabled={working}
              aria-label={`${t("workspace_switcher.create_parent_label")}: ${
                parentDir ?? t("workspace_switcher.create_pick_parent")
              }`}
            >
              {t("workspace_switcher.create_pick_parent")}
            </button>
          </div>
        </div>

        <label className="ws-form-row" htmlFor={folderId}>
          <span className="ws-form-label">{t("workspace_switcher.clone_folder_label")}</span>
          <input
            id={folderId}
            type="text"
            className="ws-form-input"
            value={folderName}
            placeholder={t("workspace_switcher.clone_folder_placeholder")}
            onChange={(e) => setFolderName(e.target.value)}
            disabled={working}
            spellCheck={false}
          />
        </label>

        {working && (
          <div className="ws-progress" role="status" aria-live="polite">
            {progress
              ? `${progress.phase ?? ""}${progress.phase ? ": " : ""}${progress.message}`
              : t("workspace_switcher.progress_starting")}
          </div>
        )}
        {error && (
          <p className="ws-form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="modal-btn modal-btn-cancel"
          onClick={onBack}
          disabled={working}
        >
          {t("workspace_switcher.back")}
        </button>
        <div className="modal-spacer" />
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={submit}
          disabled={working || url.trim().length === 0 || !parentDir}
        >
          {working ? t("workspace_switcher.clone_working") : t("workspace_switcher.clone_submit")}
        </button>
      </div>
    </>
  );
}

// Exported for unit testing — keeps the URL→folder-name heuristic in sync
// with what the Rust side does when no explicit `name` was supplied.
export function deriveDisplayNameFromUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  const segment = trimmed.split(/[/:]/).pop() ?? "";
  const stripped = segment.replace(/\.git$/, "");
  return stripped.length > 0 ? stripped : null;
}
