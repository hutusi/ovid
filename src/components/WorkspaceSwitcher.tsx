import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Check, MoreHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logoUrl from "../../branding/ovid-logo-square.png?url";
import type { CloneProgress } from "../lib/commands/generated/CloneProgress";
import { listenEvent } from "../lib/commands/internal";
import type { RecentWorkspace } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./WorkspaceSwitcher.css";

/** Hard-coded starter for the "From Amytis starter" template option. */
const AMYTIS_STARTER_URL = "https://github.com/hutusi/amytis-starter.git";

type Section = "recent" | "open" | "create" | "clone";

const SECTIONS: readonly Section[] = ["recent", "open", "create", "clone"] as const;

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
  const [section, setSection] = useState<Section>("recent");
  const tabRefs = useRef<Record<Section, HTMLButtonElement | null>>({
    recent: null,
    open: null,
    create: null,
    clone: null,
  });

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  function handleTabKeyDown(e: React.KeyboardEvent) {
    const idx = SECTIONS.indexOf(section);
    let next = idx;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % SECTIONS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SECTIONS.length - 1;
    else return;
    e.preventDefault();
    const nextSection = SECTIONS[next];
    setSection(nextSection);
    tabRefs.current[nextSection]?.focus();
  }

  const sectionLabels: Record<Section, string> = {
    recent: t("workspace_switcher.section_recent"),
    open: t("workspace_switcher.section_open"),
    create: t("workspace_switcher.section_create"),
    clone: t("workspace_switcher.section_clone"),
  };

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
        <header className="ws-header">
          <img
            src={logoUrl}
            alt={t("workspace_switcher.logo_alt")}
            className="ws-logo"
            width={48}
            height={48}
          />
          <div className="ws-title-block">
            <h2 className="ws-title">{t("workspace_switcher.title")}</h2>
            <p className="ws-subtitle">{t("workspace_switcher.subtitle")}</p>
          </div>
          <button
            type="button"
            className="ws-close-btn"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="ws-body">
          <div
            className="ws-nav"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("workspace_switcher.title")}
            onKeyDown={handleTabKeyDown}
          >
            {SECTIONS.map((s) => {
              const isActive = s === section;
              const isRecent = s === "recent";
              const tabAriaLabel =
                isRecent && recentWorkspaces.length > 0
                  ? `${sectionLabels[s]}, ${recentWorkspaces.length}`
                  : undefined;
              return (
                <button
                  key={s}
                  ref={(el) => {
                    tabRefs.current[s] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`ws-tab-${s}`}
                  aria-selected={isActive}
                  aria-controls="ws-panel"
                  aria-label={tabAriaLabel}
                  tabIndex={isActive ? 0 : -1}
                  className={`ws-nav-tab${isActive ? " ws-nav-tab--active" : ""}`}
                  onClick={() => setSection(s)}
                >
                  <span className="ws-nav-tab-label">{sectionLabels[s]}</span>
                  {isRecent && recentWorkspaces.length > 0 && (
                    <span className="ws-nav-count" aria-hidden="true">
                      {recentWorkspaces.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            className="ws-panel-content"
            role="tabpanel"
            id="ws-panel"
            aria-labelledby={`ws-tab-${section}`}
          >
            {section === "recent" && (
              <RecentPanel
                recentWorkspaces={recentWorkspaces}
                currentRootPath={currentRootPath}
                onSelect={onSelect}
                onRemoveRecent={onRemoveRecent}
                onToast={onToast}
                onClose={onClose}
              />
            )}
            {section === "open" && (
              <OpenPanel
                onOpenOther={() => {
                  onOpenOther();
                  onClose();
                }}
              />
            )}
            {section === "create" && (
              <CreatePanel
                onCreate={onCreate}
                onCloneStarter={(parentDir, name) => onClone(AMYTIS_STARTER_URL, parentDir, name)}
                onSuccess={(name) => {
                  onToast(t("workspace_switcher.toast_created", { name }));
                  onClose();
                }}
              />
            )}
            {section === "clone" && (
              <ClonePanel
                onClone={onClone}
                onSuccess={(name) => {
                  onToast(t("workspace_switcher.toast_cloned", { name }));
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recent panel ─────────────────────────────────────────────────────────

interface RecentPanelProps {
  recentWorkspaces: RecentWorkspace[];
  currentRootPath: string | null;
  onSelect: (rootPath: string) => void;
  onRemoveRecent: (rootPath: string) => void;
  onToast: (message: string) => void;
  onClose: () => void;
}

function RecentPanel({
  recentWorkspaces,
  currentRootPath,
  onSelect,
  onRemoveRecent,
  onToast,
  onClose,
}: RecentPanelProps) {
  const { t } = useTranslation();
  // `selectedRecent` is the row the user has clicked once to highlight. The
  // primary "Switch" footer button then commits the switch. A second click on
  // an already-selected row also commits (which collapses into the native
  // double-click affordance — mouse users can double-click for the fast path).
  const [selectedRecent, setSelectedRecent] = useState<string | null>(null);

  const canConfirm = selectedRecent !== null && selectedRecent !== currentRootPath;

  function confirmSwitch(rootPath: string) {
    if (rootPath !== currentRootPath) onSelect(rootPath);
    onClose();
  }

  function handleRowActivate(rootPath: string) {
    // First click on a row selects it; a second click on the same row
    // promotes to a switch. Clicking the current workspace's row only marks
    // it (the Switch button stays disabled), so there's no accidental
    // re-open of the already-open workspace.
    if (rootPath === currentRootPath) {
      setSelectedRecent(rootPath);
      return;
    }
    if (selectedRecent === rootPath) {
      confirmSwitch(rootPath);
    } else {
      setSelectedRecent(rootPath);
    }
  }

  return (
    <div className="ws-recent">
      <ul className="ws-list" aria-label={t("workspace_switcher.recent_heading")}>
        {recentWorkspaces.map((w) => (
          <RecentItem
            key={w.rootPath}
            workspace={w}
            isCurrent={w.rootPath === currentRootPath}
            isSelected={w.rootPath === selectedRecent}
            onActivate={() => handleRowActivate(w.rootPath)}
            onRemove={() => {
              onRemoveRecent(w.rootPath);
              if (selectedRecent === w.rootPath) setSelectedRecent(null);
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

      {recentWorkspaces.length > 0 && (
        <div className="ws-form-actions">
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={() => {
              if (selectedRecent !== null) confirmSwitch(selectedRecent);
            }}
            disabled={!canConfirm}
          >
            {t("workspace_switcher.switch_submit")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Recent item with overflow menu ───────────────────────────────────────

interface RecentItemProps {
  workspace: RecentWorkspace;
  isCurrent: boolean;
  isSelected: boolean;
  onActivate: () => void;
  onRemove: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
}

function RecentItem({
  workspace,
  isCurrent,
  isSelected,
  onActivate,
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

  const classes = ["ws-item"];
  if (isCurrent) classes.push("ws-item--active");
  if (isSelected) classes.push("ws-item--selected");

  return (
    <li ref={containerRef} className={classes.join(" ")}>
      <div className="ws-item-header">
        <button
          type="button"
          className="ws-item-button"
          onClick={onActivate}
          aria-pressed={isSelected}
        >
          <span className="ws-item-marker" aria-hidden="true">
            {isCurrent && <Check size={12} />}
          </span>
          <span className="ws-item-text">
            <span className="ws-item-name">{workspace.name}</span>
            <span className="ws-item-path">{workspace.rootPath}</span>
          </span>
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

// ── Open panel ───────────────────────────────────────────────────────────

interface OpenPanelProps {
  onOpenOther: () => void;
}

function OpenPanel({ onOpenOther }: OpenPanelProps) {
  const { t } = useTranslation();
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ctaRef.current?.focus();
  }, []);
  return (
    <div className="ws-open-panel">
      <p className="ws-open-explainer">{t("workspace_switcher.open_explainer")}</p>
      <button
        ref={ctaRef}
        type="button"
        className="modal-btn modal-btn-primary ws-open-cta"
        onClick={onOpenOther}
      >
        {t("workspace_switcher.open_cta")}
      </button>
    </div>
  );
}

// ── Create panel ─────────────────────────────────────────────────────────

type CreateTemplate = "stub" | "starter";

interface CreatePanelProps {
  onCreate: (parentDir: string, name: string) => Promise<boolean>;
  onCloneStarter: (parentDir: string, name: string | null) => Promise<boolean>;
  onSuccess: (name: string) => void;
}

function CreatePanel({ onCreate, onCloneStarter, onSuccess }: CreatePanelProps) {
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
    try {
      const ok =
        template === "stub"
          ? await onCreate(parentDir, trimmedName)
          : await onCloneStarter(parentDir, trimmedName);
      if (ok) onSuccess(trimmedName);
    } finally {
      setWorking(false);
    }
  }

  return (
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
            <span className="ws-template-name">{t("workspace_switcher.create_template_stub")}</span>
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
            <span className="ws-template-name">{t("workspace_switcher.create_template_repo")}</span>
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

      <div className="ws-form-actions">
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={submit}
          disabled={working || !nameIsValid(name) || !parentDir}
        >
          {working ? t("workspace_switcher.create_working") : t("workspace_switcher.create_submit")}
        </button>
      </div>
    </div>
  );
}

// ── Clone panel ──────────────────────────────────────────────────────────

interface ClonePanelProps {
  onClone: (url: string, parentDir: string, name: string | null) => Promise<boolean>;
  onSuccess: (name: string) => void;
}

function ClonePanel({ onClone, onSuccess }: ClonePanelProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
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
    try {
      const ok = await onClone(trimmedUrl, parentDir, submittedName);
      if (ok) {
        const displayName = submittedName ?? deriveDisplayNameFromUrl(trimmedUrl) ?? trimmedUrl;
        onSuccess(displayName);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
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

      <div className="ws-form-actions">
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={submit}
          disabled={working || url.trim().length === 0 || !parentDir}
        >
          {working ? t("workspace_switcher.clone_working") : t("workspace_switcher.clone_submit")}
        </button>
      </div>
    </div>
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
