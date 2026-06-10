import { describe, expect, it } from "bun:test";
import {
  type AppAction,
  type AppActionCtx,
  appActions,
  dispatchAppAction,
  eventMatchesShortcut,
  getAppAction,
} from "./appActions";
import { shortcuts } from "./shortcuts";
import type { OverlayStack } from "./useOverlayStack";

// The native-menu payload vocabulary that routes through useMenuActions —
// mirrors the `menu-action` payload ids emitted by src-tauri/src/menu.rs.
// (Editor-routed payloads — format-*, insert-*, find* — dispatch through
// the editor command table instead and are deliberately absent.)
// Update this list together with menu.rs.
const MENU_PAYLOAD_IDS = [
  "new-post",
  "new-note",
  "new-series",
  "new-book",
  "new-page",
  "new-flow",
  "today-flow",
  "open-workspace",
  "switch-workspace",
  "save",
  "close-file",
  "toggle-sidebar",
  "toggle-properties",
  "toggle-search",
  "zen-mode",
  "typewriter-mode",
  "file-switcher",
  "toggle-spell-check",
  "open-preferences",
  "check-updates",
  "help-shortcuts",
  "git-commit",
  "git-switch-branch",
  "git-new-branch",
  "git-push",
  "git-pull",
  "git-fetch",
  "git-open-remote",
  "git-copy-remote-url",
  "wechat-copy",
  "wechat-publish",
];

// Actions reachable only from the keyboard (no native menu item).
const KEYBOARD_ONLY_IDS = ["new-file"];

function makeOverlay(isBlocking: boolean): OverlayStack {
  return {
    active: null,
    is: () => false,
    open: () => {},
    close: () => {},
    isBlocking,
  };
}

function makeCtx(overrides: Partial<AppActionCtx> = {}): AppActionCtx {
  return {
    overlay: makeOverlay(false),
    zenMode: false,
    workspaceRoot: "/ws",
    tree: [],
    isGitRepo: false,
    selectedFile: null,
    prefs: { spellCheck: false },
    pushSuccessMessage: "pushed",
    defaultCommitMessage: "Update: x",
    pendingMarkdownRef: { current: null },
    fileContent: "",
    showToast: () => {},
    t: (key) => key,
    setSidebarVisible: () => {},
    setPropertiesOpen: () => {},
    setZenMode: () => {},
    setTypewriterMode: () => {},
    flushPendingSave: () => {},
    closeActiveTabOrFile: () => {},
    handleOpenWorkspace: () => {},
    handleNewTodayFlow: () => {},
    openCommitDialog: () => {},
    openBranchSwitcher: () => {},
    runGitAction: () => {},
    handlePush: async () => {},
    openRemote: () => {},
    copyRemoteUrl: () => {},
    handlePull: async () => {},
    handleFetch: async () => {},
    updatePrefs: () => {},
    ...overrides,
  };
}

describe("appActions table", () => {
  it("has unique action ids", () => {
    const seen = new Set<string>();
    for (const action of appActions) {
      expect(seen.has(action.id)).toBe(false);
      seen.add(action.id);
    }
  });

  it("covers every global-source shortcut id (except the bespoke ? key)", () => {
    const globalIds = shortcuts
      .filter((s) => s.source === "global" && s.id !== "show-shortcuts")
      .map((s) => s.id);
    for (const id of globalIds) {
      expect(getAppAction(id), `shortcut id "${id}" has no appActions row`).toBeDefined();
    }
  });

  it("every action id is a known menu payload or explicitly keyboard-only", () => {
    for (const action of appActions) {
      const known = MENU_PAYLOAD_IDS.includes(action.id) || KEYBOARD_ONLY_IDS.includes(action.id);
      expect(known, `action id "${action.id}" is not in the menu payload vocabulary`).toBe(true);
    }
  });

  it("every menu payload id has a table row", () => {
    for (const id of MENU_PAYLOAD_IDS) {
      expect(getAppAction(id), `menu payload "${id}" has no appActions row`).toBeDefined();
    }
  });
});

describe("dispatchAppAction guards", () => {
  const probe = (overrides: Partial<AppAction> = {}) => {
    let fired = 0;
    const action: AppAction = { id: "probe", run: () => void fired++, ...overrides };
    return { action, fired: () => fired };
  };

  it("a blocking overlay suppresses actions without allowWhenBlocking", () => {
    const ctx = makeCtx({ overlay: makeOverlay(true) });
    const blocked = probe();
    expect(dispatchAppAction(blocked.action, ctx, { inInput: false })).toBe(false);
    expect(blocked.fired()).toBe(0);

    const allowed = probe({ allowWhenBlocking: true });
    expect(dispatchAppAction(allowed.action, ctx, { inInput: false })).toBe(true);
    expect(allowed.fired()).toBe(1);
  });

  it("input focus suppresses actions without allowInInput", () => {
    const ctx = makeCtx();
    const suppressed = probe();
    expect(dispatchAppAction(suppressed.action, ctx, { inInput: true })).toBe(false);

    const allowed = probe({ allowInInput: true });
    expect(dispatchAppAction(allowed.action, ctx, { inInput: true })).toBe(true);
  });

  it("the when guard gates the run", () => {
    const ctx = makeCtx({ isGitRepo: false });
    const gated = probe({ when: (c) => c.isGitRepo });
    expect(dispatchAppAction(gated.action, ctx, { inInput: false })).toBe(false);
    expect(dispatchAppAction(gated.action, makeCtx({ isGitRepo: true }), { inInput: false })).toBe(
      true
    );
  });

  it("git actions require a git repo; workspace actions require a workspace", () => {
    const noGit = makeCtx({ isGitRepo: false });
    // biome-ignore lint/style/noNonNullAssertion: asserted present by the table tests
    expect(dispatchAppAction(getAppAction("git-commit")!, noGit, { inInput: false })).toBe(false);
    const noWs = makeCtx({ workspaceRoot: null });
    // biome-ignore lint/style/noNonNullAssertion: asserted present by the table tests
    expect(dispatchAppAction(getAppAction("new-post")!, noWs, { inInput: false })).toBe(false);
  });
});

describe("eventMatchesShortcut", () => {
  const event = (init: Partial<KeyboardEvent> & { key: string }) =>
    ({
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...init,
    }) as KeyboardEvent;

  it("matches mod as Cmd or Ctrl, but not the Cmd+Ctrl chord", () => {
    const keys = { mod: true, key: "p" };
    expect(eventMatchesShortcut(keys, event({ key: "p", metaKey: true }))).toBe(true);
    expect(eventMatchesShortcut(keys, event({ key: "p", ctrlKey: true }))).toBe(true);
    expect(eventMatchesShortcut(keys, event({ key: "p" }))).toBe(false);
    expect(eventMatchesShortcut(keys, event({ key: "p", metaKey: true, ctrlKey: true }))).toBe(
      false
    );
  });

  it("ctrl:true means the macOS Cmd+Ctrl chord (zen mode)", () => {
    const keys = { mod: true, ctrl: true, key: "z" };
    expect(eventMatchesShortcut(keys, event({ key: "z", metaKey: true, ctrlKey: true }))).toBe(
      true
    );
    expect(eventMatchesShortcut(keys, event({ key: "z", metaKey: true }))).toBe(false);
  });

  it("requires exact shift and alt", () => {
    const keys = { mod: true, shift: true, key: "l" };
    expect(eventMatchesShortcut(keys, event({ key: "l", metaKey: true, shiftKey: true }))).toBe(
      true
    );
    expect(eventMatchesShortcut(keys, event({ key: "l", metaKey: true }))).toBe(false);
    expect(
      eventMatchesShortcut(keys, event({ key: "l", metaKey: true, shiftKey: true, altKey: true }))
    ).toBe(false);
  });

  it("key comparison is case-insensitive", () => {
    expect(
      eventMatchesShortcut(
        { mod: true, shift: true, key: "g" },
        event({ key: "G", metaKey: true, shiftKey: true })
      )
    ).toBe(true);
  });
});
