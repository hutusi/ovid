import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FileNode } from "./types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: localT,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

// ── Tauri seam mock ────────────────────────────────────────────────────────
//
// useWorkspace goes through commands.* → invokeCmd → @tauri-apps/api/core's
// invoke. We replace that bottom layer with a controllable dispatcher
// (matches the pattern in commands/internal.test.ts), then drive the hook
// via @testing-library/react. See ADR 0012.

type InvokeImpl = (name: string, args: unknown) => Promise<unknown>;
type InvokeHandlers = Partial<Record<string, (args: unknown) => unknown>>;

let invokeImpl: InvokeImpl = () =>
  Promise.reject(new Error("unmocked invoke — register a handler in the test"));
const invokeCalls: Array<{ name: string; args: unknown }> = [];

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args?: unknown) => {
    invokeCalls.push({ name, args });
    return invokeImpl(name, args);
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

let confirmReturn = true;
mock.module("@tauri-apps/plugin-dialog", () => ({
  confirm: () => Promise.resolve(confirmReturn),
}));

/** Build an invokeImpl that dispatches by command name. Unknown names reject
 *  loudly so a test that forgot to mock a call doesn't pass by accident. */
function whenInvoke(handlers: InvokeHandlers): InvokeImpl {
  return async (name, args) => {
    const handler = handlers[name];
    if (!handler) {
      throw new Error(`useWorkspace test issued unmocked invoke: ${name}`);
    }
    return handler(args);
  };
}

const { useWorkspace } = await import("./useWorkspace");

// ── Fixtures ───────────────────────────────────────────────────────────────

const ROOT_PATH = "/ws";
const TREE_ROOT = "/ws/content";
const ASSET_ROOT = "/ws";

function makeNode(path: string, name?: string): FileNode {
  return {
    name: name ?? path.split("/").pop() ?? path,
    path,
    isDirectory: false,
    extension: ".md",
  };
}

function makeWorkspaceResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "ws",
    rootPath: ROOT_PATH,
    treeRoot: TREE_ROOT,
    assetRoot: ASSET_ROOT,
    tree: [makeNode("/ws/content/posts/hello.md")],
    isAmytisWorkspace: true,
    cdnBase: null,
    defaultAuthor: null,
    postsBasePath: null,
    features: [],
    authors: [],
    i18n: { locales: [], defaultLocale: null },
    ...overrides,
  };
}

function makeOptions(overrides: Partial<Parameters<typeof useWorkspace>[0]> = {}) {
  return {
    showToast: mock((_: string) => {}),
    flushPendingSave: mock(() => Promise.resolve()),
    resetFileState: mock(() => {}),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useWorkspace", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);
  beforeEach(() => {
    invokeImpl = () => Promise.reject(new Error("unmocked"));
    invokeCalls.length = 0;
    confirmReturn = true;
  });

  it("openWorkspaceAtPath populates state from the returned WorkspaceResult", async () => {
    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult(),
    });

    const opts = makeOptions();
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    expect(result.current.workspaceName).toBe("ws");
    expect(result.current.workspaceRoot).toBe(TREE_ROOT);
    expect(result.current.workspaceRootPath).toBe(ROOT_PATH);
    expect(result.current.isAmytisWorkspace).toBe(true);
    expect(result.current.tree).toHaveLength(1);
    expect(opts.resetFileState).toHaveBeenCalledTimes(1);
    expect(opts.showToast).not.toHaveBeenCalled();
  });

  it("openWorkspaceAtPath toasts and leaves state empty when invoke returns null", async () => {
    invokeImpl = whenInvoke({
      open_workspace_at_path: () => null,
    });

    const showToast = mock((_: string) => {});
    const opts = makeOptions({ showToast });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/missing");
    });

    expect(result.current.workspaceName).toBeNull();
    expect(result.current.isAmytisWorkspace).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0]?.[0]).toMatch(/no longer be valid/i);
  });

  it("openWorkspaceAtPath toasts when the workspace isn't Amytis", async () => {
    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ isAmytisWorkspace: false }),
    });

    const showToast = mock((_: string) => {});
    const opts = makeOptions({ showToast });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    expect(result.current.isAmytisWorkspace).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0]?.[0]).toMatch(/doesn't look like an Amytis/i);
  });

  it("handleNewFile creates the file via ensure_dir + create_file then fires onPathCreated", async () => {
    // First open a workspace so handleNewFile has a contentRoot. We don't
    // hard-code the new file path because buildNewContent (a tested helper
    // exercised by amytisScaffold tests) decides the layout — instead we
    // capture whatever path create_file is invoked with and serve a tree
    // containing exactly that path on the post-create refresh.
    const created: FileNode[] = [];
    let capturedNewPath: string | null = null;

    invokeImpl = whenInvoke({
      open_workspace_at_path: () =>
        makeWorkspaceResult({
          tree: [makeNode("/ws/content/notes/existing.md")],
        }),
      ensure_dir: () => undefined,
      create_file: (args) => {
        capturedNewPath = (args as { path: string }).path;
        return undefined;
      },
      list_workspace_tree: () => {
        const tree: FileNode[] = [makeNode("/ws/content/notes/existing.md")];
        if (capturedNewPath) tree.push(makeNode(capturedNewPath));
        return tree;
      },
    });

    const opts = makeOptions({
      onPathCreated: (node) => {
        created.push(node);
      },
    });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleNewFile("/ws/content/notes", "idea", "note");
    });

    const names = invokeCalls.map((c) => c.name);
    expect(names).toContain("ensure_dir");
    expect(names).toContain("create_file");
    expect(names.indexOf("ensure_dir")).toBeLessThan(names.indexOf("create_file"));
    expect(names).toContain("list_workspace_tree");
    expect(created).toHaveLength(1);
    expect(capturedNewPath).not.toBeNull();
    expect(created[0]?.path).toBe(capturedNewPath as unknown as string);
  });

  it("handleRename calls rename_file then fires onPathRenamed with a tree lookup", async () => {
    const oldNode = makeNode("/ws/content/posts/old.md");
    const newPath = "/ws/content/posts/new.md";
    const renameCalls: Array<{ oldPath: string; newPath: string; resolved?: FileNode }> = [];

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [oldNode] }),
      rename_file: (args) => {
        renameCalls.push(args as { oldPath: string; newPath: string });
        return undefined;
      },
      list_workspace_tree: () => [makeNode(newPath)],
    });

    const renamed: Array<{ oldPath: string; newPath: string }> = [];
    const opts = makeOptions({
      onPathRenamed: (oldPath, newPath, lookup) => {
        renamed.push({ oldPath, newPath });
        // The contract: lookup must see the renamed node post-refresh.
        const found = lookup(newPath);
        const last = renameCalls[renameCalls.length - 1];
        if (last) last.resolved = found;
      },
    });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleRename(oldNode, "new");
    });

    expect(renameCalls).toHaveLength(1);
    expect(renameCalls[0]?.oldPath).toBe(oldNode.path);
    expect(renameCalls[0]?.newPath).toBe(newPath);
    expect(renamed).toHaveLength(1);
    expect(renameCalls[0]?.resolved?.path).toBe(newPath);
  });

  it("handleDelete trashes the path, fires onPathRemoved, and refreshes the tree", async () => {
    const node = makeNode("/ws/content/posts/hello.md");
    const trashCalls: Array<{ path: string }> = [];
    const removed: string[] = [];

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [node] }),
      trash_file: (args) => {
        trashCalls.push(args as { path: string });
        return undefined;
      },
      list_workspace_tree: () => [],
    });

    const opts = makeOptions({
      onPathRemoved: (path) => {
        removed.push(path);
      },
    });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleDelete(node);
    });

    expect(trashCalls).toHaveLength(1);
    expect(trashCalls[0]?.path).toBe(node.path);
    expect(removed).toEqual([node.path]);
    // open_workspace_at_path returns the tree inline; the only list_workspace_tree
    // call is the post-delete refresh.
    expect(invokeCalls.filter((c) => c.name === "list_workspace_tree")).toHaveLength(1);
  });

  it("handleDelete is a no-op when the user cancels the confirm dialog", async () => {
    confirmReturn = false;
    const node = makeNode("/ws/content/posts/hello.md");

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [node] }),
    });

    const opts = makeOptions({ onPathRemoved: mock(() => {}) });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleDelete(node);
    });

    expect(invokeCalls.filter((c) => c.name === "trash_file")).toHaveLength(0);
    expect(opts.onPathRemoved).not.toHaveBeenCalled();
  });

  it("handleNewTodayFlow ensures the flows directory and creates today's file", async () => {
    let capturedNewPath: string | null = null;
    const created: FileNode[] = [];

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult(),
      ensure_dir: () => undefined,
      create_file: (args) => {
        capturedNewPath = (args as { path: string }).path;
        return undefined;
      },
      list_workspace_tree: () => {
        const tree: FileNode[] = [];
        if (capturedNewPath) tree.push(makeNode(capturedNewPath));
        return tree;
      },
    });

    const opts = makeOptions({
      onPathCreated: (node) => {
        created.push(node);
      },
    });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleNewTodayFlow();
    });

    expect(capturedNewPath).not.toBeNull();
    // Path shape: /ws/content/flows/YYYY/MM/DD.md
    expect(capturedNewPath).toMatch(/\/flows\/\d{4}\/\d{2}\/\d{2}\.md$/);
    expect(created).toHaveLength(1);
  });

  it("handleNewTodayFlow swallows the 'already exists' create_file error", async () => {
    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult(),
      ensure_dir: () => undefined,
      create_file: () => {
        throw new Error("file already exists at that path");
      },
      list_workspace_tree: () => [],
    });

    const showToast = mock((_: string) => {});
    const opts = makeOptions({ showToast });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleNewTodayFlow();
    });

    // Graceful: refresh happens, no error toast.
    expect(showToast).not.toHaveBeenCalled();
    expect(invokeCalls.some((c) => c.name === "list_workspace_tree")).toBe(true);
  });

  it("handleDuplicate calls duplicate_entry then fires onPathCreated", async () => {
    const original = makeNode("/ws/content/posts/2026-05-31-original.md");
    let capturedDest: string | null = null;
    const created: FileNode[] = [];

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [original] }),
      duplicate_entry: (args) => {
        capturedDest = (args as { srcPath: string; destPath: string }).destPath;
        return undefined;
      },
      list_workspace_tree: () => {
        const tree: FileNode[] = [original];
        if (capturedDest) tree.push(makeNode(capturedDest));
        return tree;
      },
    });

    const opts = makeOptions({
      onPathCreated: (node) => {
        created.push(node);
      },
    });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleDuplicate(original, "copy");
    });

    expect(capturedDest).not.toBeNull();
    expect(created).toHaveLength(1);
    expect(created[0]?.path).toBe(capturedDest as unknown as string);
  });

  it("handleNewFromExisting reads source, scaffolds via createPostFromExisting, fires onPathCreated", async () => {
    const source = makeNode("/ws/content/posts/2026-05-31-source.md");
    const sourceContent = "---\ntitle: Source\n---\n\nBody text.\n";
    let capturedDest: string | null = null;
    let capturedNewContent: string | null = null;
    const created: FileNode[] = [];

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [source] }),
      read_file: () => sourceContent,
      create_file: (args) => {
        const a = args as { path: string; content: string };
        capturedDest = a.path;
        capturedNewContent = a.content;
        return undefined;
      },
      list_workspace_tree: () => {
        const tree: FileNode[] = [source];
        if (capturedDest) tree.push(makeNode(capturedDest));
        return tree;
      },
    });

    const opts = makeOptions({
      onPathCreated: (node) => {
        created.push(node);
      },
    });
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.handleNewFromExisting(source, "derived");
    });

    expect(capturedDest).not.toBeNull();
    expect(capturedNewContent).not.toBeNull();
    // createPostFromExistingContent rewrites the frontmatter (resetting fields
    // like title/date) and drops the body — it's a scaffold from an existing
    // post's *shape*, not a copy. Assert on the structural contract.
    const newContent = capturedNewContent as unknown as string;
    expect(newContent).toMatch(/^---\n/);
    expect(newContent).toContain("title:");
    expect(created).toHaveLength(1);
  });

  it("addCollectionItem reads, transforms, and writes the index file", async () => {
    const indexPath = "/ws/content/series/my-series/index.md";
    const indexNode = makeNode(indexPath);
    const originalContent =
      "---\ntitle: My Series\ntype: collection\nitems:\n  - post: existing-post\n---\n";
    let writtenContent: string | null = null;

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [indexNode] }),
      read_file: () => originalContent,
      write_file: (args) => {
        writtenContent = (args as { path: string; content: string }).content;
        return undefined;
      },
      list_workspace_tree: () => [indexNode],
    });

    const opts = makeOptions();
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      await result.current.addCollectionItem(indexPath, { post: "new-post" });
    });

    expect(writtenContent).not.toBeNull();
    // The transformed YAML keeps the existing item and appends the new one.
    const out = writtenContent as unknown as string;
    expect(out).toContain("existing-post");
    expect(out).toContain("new-post");
  });

  it("removeCollectionItem strips an item from the index file", async () => {
    const indexPath = "/ws/content/series/my-series/index.md";
    const indexNode = makeNode(indexPath);
    const originalContent =
      "---\ntitle: My Series\ntype: collection\nitems:\n  - post: keep-me\n  - post: remove-me\n---\n";
    let writtenContent: string | null = null;

    invokeImpl = whenInvoke({
      open_workspace_at_path: () => makeWorkspaceResult({ tree: [indexNode] }),
      read_file: () => originalContent,
      write_file: (args) => {
        writtenContent = (args as { path: string; content: string }).content;
        return undefined;
      },
      list_workspace_tree: () => [indexNode],
    });

    const opts = makeOptions();
    const { result } = renderHook(() => useWorkspace(opts));

    await act(async () => {
      await result.current.openWorkspaceAtPath("/ws");
    });

    await act(async () => {
      // itemKey() prefixes with "post:" / "series:" — see collection.ts.
      await result.current.removeCollectionItem(indexPath, "post:remove-me");
    });

    expect(writtenContent).not.toBeNull();
    const out = writtenContent as unknown as string;
    expect(out).toContain("keep-me");
    expect(out).not.toContain("remove-me");
  });
});
