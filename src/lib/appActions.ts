import type React from "react";
import type { NewContentKind } from "./amytisScaffold";
import { parseFrontmatter } from "./frontmatter";
import type { ShortcutKeys } from "./shortcuts";
import type { FileNode } from "./types";
import { PROPERTIES_OPEN_KEY, SIDEBAR_VISIBLE_KEY, togglePersisted } from "./uiVisibility";
import type { OverlayStack } from "./useOverlayStack";
import { markdownToWechatHtml } from "./wechatHtml";

// ─── Global action dispatch table (ADR 0018) ──────────────────────────────
//
// One declarative row per app-level action, shared by the two input
// adapters: useKeyboardShortcuts (matches `"global"`-source entries from
// shortcuts.ts by id) and useMenuActions (matches native menu payloads by
// id). Action ids ARE the native menu payload ids — menu.rs emits them
// verbatim. Keyboard keys stay in shortcuts.ts (the single source of truth
// the help dialog renders from); the keyboard adapter joins the two by id.
//
// Editor-routed commands (format-*, insert-*, find*) are NOT here — they
// live in the editor command table (src/lib/editor/commands.ts, ADR 0008).

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export interface AppActionCtx {
  overlay: OverlayStack;
  zenMode: boolean;

  // Routing conditions
  workspaceRoot: string | null;
  tree: FileNode[];
  isGitRepo: boolean;
  selectedFile: FileNode | null;
  prefs: { spellCheck: boolean };
  pushSuccessMessage: string;
  defaultCommitMessage: string;

  // For wechat-copy
  pendingMarkdownRef: React.RefObject<string | null>;
  fileContent: string;
  showToast: (message: string) => void;
  t: Translate;

  // State setters that aren't backed by the overlay stack
  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
  setTypewriterMode: React.Dispatch<React.SetStateAction<boolean>>;

  // Action handlers
  flushPendingSave: () => void;
  closeActiveTabOrFile: () => void;
  handleOpenWorkspace: () => void;
  handleNewTodayFlow: () => void;
  openCommitDialog: (message: string) => void;
  openBranchSwitcher: () => void;
  runGitAction: (type: "push" | "pull" | "fetch", fn: () => Promise<void>, msg: string) => void;
  handlePush: () => Promise<void>;
  openRemote: () => void;
  copyRemoteUrl: () => void;
  handlePull: () => Promise<void>;
  handleFetch: () => Promise<void>;
  updatePrefs: (updates: { spellCheck: boolean }) => void;
}

export interface AppAction {
  /** Stable id — equals the native menu payload and (when one exists) the
   *  `"global"`-source shortcut entry id in shortcuts.ts. */
  id: string;
  /** Fire even while a blocking overlay is open (mode toggles, save,
   *  open-workspace — actions that must stay reachable). Default: false. */
  allowWhenBlocking?: boolean;
  /** Keyboard adapter only: fire even when an input/textarea/contenteditable
   *  has focus. Default: false. (Menu events have no focus context.) */
  allowInInput?: boolean;
  /** Routing condition beyond the blocking/input guards. */
  when?: (ctx: AppActionCtx) => boolean;
  run: (ctx: AppActionCtx) => void | Promise<void>;
}

const hasWorkspace = (ctx: AppActionCtx) => ctx.workspaceRoot !== null;
const inGitRepo = (ctx: AppActionCtx) => ctx.isGitRepo;

function openNewFileDialog(ctx: AppActionCtx, kind: NewContentKind): void {
  if (!ctx.workspaceRoot) return;
  ctx.overlay.open({
    kind: "modal",
    state: { type: "new-file", dirPath: ctx.workspaceRoot, kind },
  });
}

// Native "New <type>" menu actions → content kind. Generates one table row
// per entry, so there's no switch case to keep in sync.
const NEW_CONTENT_ACTIONS: Array<[string, NewContentKind]> = [
  ["new-post", "post"],
  ["new-note", "note"],
  ["new-series", "series"],
  ["new-book", "book"],
  ["new-page", "page"],
];

async function runWechatCopy(ctx: AppActionCtx): Promise<void> {
  const markdown = ctx.pendingMarkdownRef.current ?? parseFrontmatter(ctx.fileContent).body;
  if (!markdown.trim()) {
    ctx.showToast(ctx.t("menu.file_wechat_copy_no_content"));
    return;
  }
  const { html, hasMath } = markdownToWechatHtml(markdown);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
    ]);
  } catch {
    try {
      await navigator.clipboard.writeText(html);
    } catch (fallbackErr) {
      ctx.showToast(String(fallbackErr));
      return;
    }
  }
  ctx.showToast(
    hasMath ? ctx.t("menu.file_wechat_copy_math_warning") : ctx.t("menu.file_wechat_copy_success")
  );
}

export const appActions: AppAction[] = [
  // ── Files ──────────────────────────────────────────────────────────────
  {
    id: "open-workspace",
    allowWhenBlocking: true,
    run: (ctx) => void ctx.handleOpenWorkspace(),
  },
  {
    id: "switch-workspace",
    run: (ctx) => ctx.overlay.open({ kind: "workspaceSwitcher" }),
  },
  {
    id: "new-file", // keyboard-only (Cmd+N); native menu uses the new-<type> ids
    when: hasWorkspace,
    run: (ctx) => openNewFileDialog(ctx, "post"),
  },
  ...NEW_CONTENT_ACTIONS.map(
    ([id, kind]): AppAction => ({
      id,
      when: hasWorkspace,
      run: (ctx) => openNewFileDialog(ctx, kind),
    })
  ),
  {
    // Flows are date-based (flows/Y/M/D), so "new flow" and "today's flow"
    // are the same action under two menu ids.
    id: "new-flow",
    when: hasWorkspace,
    run: (ctx) => void ctx.handleNewTodayFlow(),
  },
  {
    id: "today-flow",
    when: hasWorkspace,
    run: (ctx) => void ctx.handleNewTodayFlow(),
  },
  {
    id: "save",
    allowWhenBlocking: true,
    run: (ctx) => void ctx.flushPendingSave(),
  },
  {
    id: "close-file",
    allowWhenBlocking: true,
    run: (ctx) => ctx.closeActiveTabOrFile(),
  },

  // ── Navigation / view ──────────────────────────────────────────────────
  {
    id: "file-switcher",
    when: (ctx) => ctx.tree.length > 0,
    run: (ctx) => ctx.overlay.open({ kind: "switcher" }),
  },
  {
    id: "toggle-sidebar",
    allowWhenBlocking: true,
    allowInInput: true,
    run: (ctx) => togglePersisted(ctx.setSidebarVisible, SIDEBAR_VISIBLE_KEY),
  },
  {
    id: "toggle-properties",
    allowWhenBlocking: true,
    allowInInput: true,
    run: (ctx) => togglePersisted(ctx.setPropertiesOpen, PROPERTIES_OPEN_KEY),
  },
  {
    id: "toggle-search",
    allowWhenBlocking: true,
    allowInInput: true,
    when: hasWorkspace,
    run: (ctx) => {
      if (ctx.overlay.is("search")) ctx.overlay.close("search");
      else ctx.overlay.open({ kind: "search" });
    },
  },
  {
    id: "zen-mode",
    allowWhenBlocking: true,
    allowInInput: true,
    run: (ctx) => ctx.setZenMode((v) => !v),
  },
  {
    id: "typewriter-mode",
    allowWhenBlocking: true,
    run: (ctx) => ctx.setTypewriterMode((v) => !v),
  },
  {
    id: "toggle-spell-check",
    allowWhenBlocking: true,
    run: (ctx) => ctx.updatePrefs({ spellCheck: !ctx.prefs.spellCheck }),
  },
  {
    id: "open-preferences",
    allowInInput: true,
    run: (ctx) => ctx.overlay.open({ kind: "preferences" }),
  },
  {
    id: "check-updates",
    run: (ctx) => ctx.overlay.open({ kind: "update" }),
  },
  {
    id: "help-shortcuts",
    run: (ctx) => ctx.overlay.open({ kind: "shortcutsHelp" }),
  },

  // ── Git ────────────────────────────────────────────────────────────────
  {
    id: "git-commit",
    when: inGitRepo,
    run: (ctx) => void ctx.openCommitDialog(ctx.defaultCommitMessage),
  },
  {
    id: "git-switch-branch",
    when: inGitRepo,
    run: (ctx) => void ctx.openBranchSwitcher(),
  },
  {
    id: "git-new-branch",
    when: inGitRepo,
    run: (ctx) => ctx.overlay.open({ kind: "newBranch" }),
  },
  {
    id: "git-push",
    when: inGitRepo,
    run: (ctx) => void ctx.runGitAction("push", () => ctx.handlePush(), ctx.pushSuccessMessage),
  },
  {
    id: "git-pull",
    when: inGitRepo,
    run: (ctx) => void ctx.runGitAction("pull", ctx.handlePull, ctx.t("menu.git_pull_success")),
  },
  {
    id: "git-fetch",
    when: inGitRepo,
    run: (ctx) => void ctx.runGitAction("fetch", ctx.handleFetch, ctx.t("menu.git_fetch_success")),
  },
  {
    id: "git-open-remote",
    when: inGitRepo,
    run: (ctx) => void ctx.openRemote(),
  },
  {
    id: "git-copy-remote-url",
    when: inGitRepo,
    run: (ctx) => void ctx.copyRemoteUrl(),
  },

  // ── WeChat ─────────────────────────────────────────────────────────────
  {
    id: "wechat-copy",
    allowWhenBlocking: true,
    when: (ctx) => ctx.selectedFile !== null,
    run: runWechatCopy,
  },
  {
    id: "wechat-publish",
    when: (ctx) => ctx.selectedFile !== null,
    run: (ctx) => ctx.overlay.open({ kind: "wechatPublish" }),
  },
];

const actionsById = new Map(appActions.map((action) => [action.id, action]));

export function getAppAction(id: string): AppAction | undefined {
  return actionsById.get(id);
}

/** Run an action through the shared guards. Returns true when the action
 *  fired (the keyboard adapter uses this to decide preventDefault). */
export function dispatchAppAction(
  action: AppAction,
  ctx: AppActionCtx,
  opts: { inInput: boolean }
): boolean {
  if (ctx.overlay.isBlocking && !action.allowWhenBlocking) return false;
  if (opts.inInput && !action.allowInInput) return false;
  if (action.when && !action.when(ctx)) return false;
  void action.run(ctx);
  return true;
}

/** Exact-modifier match of a shortcuts.ts binding against a keyboard event.
 *  `ctrl: true` means the macOS Cmd+Ctrl chord; otherwise `mod` is
 *  Cmd-or-Ctrl. (The `?` help key is matched bespoke in
 *  useKeyboardShortcuts — it's layout-dependent, not modifier-exact.) */
export function eventMatchesShortcut(keys: ShortcutKeys, e: KeyboardEvent): boolean {
  if ((e.key?.toLowerCase() ?? "") !== keys.key.toLowerCase()) return false;
  if (keys.ctrl) {
    if (!(e.metaKey && e.ctrlKey)) return false;
  } else if (keys.mod) {
    if (!e.metaKey && !e.ctrlKey) return false;
    if (e.metaKey && e.ctrlKey) return false;
  } else if (e.metaKey || e.ctrlKey) {
    return false;
  }
  if (!!keys.shift !== e.shiftKey) return false;
  if (!!keys.alt !== e.altKey) return false;
  return true;
}
