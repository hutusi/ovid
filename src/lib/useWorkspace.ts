import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildNewContent, type NewContentKind } from "./amytisScaffold";
import {
  addItem,
  type CollectionItem,
  parseCollectionItems,
  removeItem,
  setCollectionItems,
} from "./collection";
import { commands } from "./commands";
import type { Author } from "./commands/generated/Author";
import type { FeatureBucket } from "./commands/generated/FeatureBucket";
import type { I18nConfig } from "./commands/generated/I18nConfig";
import type { WorkspaceResult as GeneratedWorkspaceResult } from "./commands/generated/WorkspaceResult";
import { type FlatFile, flattenTree } from "./fileSearch";
import { createTodayFlowFrontmatter } from "./frontmatter";
import { measureAsync } from "./perf";
import { buildPostTargetPath } from "./postPath";
import { createPostFromExistingContent } from "./postTemplate";
import { forContentMode } from "./sidebarUtils";
import type { FileNode } from "./types";
import type { ContentPreferences } from "./useContentPreferences";

// Same as the generated (Rust-sourced) WorkspaceResult, except `tree` is
// re-typed to the frontend's own FileNode (./types) — the sidebar projections'
// richer shape, not the wire-format one. Deriving the rest from the generated
// type (rather than redeclaring it) means a real backend field change shows
// up here as a compile error instead of silently drifting.
type WorkspaceResult = Omit<GeneratedWorkspaceResult, "tree"> & { tree: FileNode[] };

interface UseWorkspaceOptions {
  showToast: (msg: string) => void;
  flushPendingSave: () => Promise<void>;
  resetFileState: () => void;
  /** New-content format/layout choice, threaded into `handleNewFile`'s scaffold call. */
  contentPrefs?: ContentPreferences;
  /**
   * Called by the workspace lifecycle handlers (`handleNewFile`,
   * `handleNewTodayFlow`, `handleDuplicate`, `handleNewFromExisting`) once a
   * fresh node exists in the tree. The session opens the file — selects it
   * for editing, pushes to recents, opens its tab — in one consistent step.
   */
  onPathCreated?: (node: FileNode) => Promise<void> | void;
  /**
   * Called after a successful rename, with a `lookup` closure scoped to the
   * just-walked tree. The session needs the closure to resolve the renamed
   * file's new node *with full metadata* (containerDirPath, title,
   * contentType) — `flatFiles` is a useMemo on tree state and doesn't
   * recompute until the next render, so a lookup against it from the same
   * tick would miss the just-renamed node and fall back to a synthetic node
   * stripped of metadata.
   */
  onPathRenamed?: (
    oldPath: string,
    newPath: string,
    lookup: (path: string) => FileNode | undefined
  ) => void;
  onPathRemoved?: (path: string) => Promise<void> | void;
}

function findNode(nodes: FileNode[], path: string): FileNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const found = findNode(n.children, path);
      if (found) return found;
    }
  }
}

export function useWorkspace({
  showToast,
  flushPendingSave,
  resetFileState,
  contentPrefs,
  onPathCreated,
  onPathRenamed,
  onPathRemoved,
}: UseWorkspaceOptions) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(null);
  const [isAmytisWorkspace, setIsAmytisWorkspace] = useState(false);
  const [assetRoot, setAssetRoot] = useState<string | undefined>(undefined);
  const [cdnBase, setCdnBase] = useState<string | undefined>(undefined);
  const [defaultAuthor, setDefaultAuthor] = useState<string | undefined>(undefined);
  const [postsBasePath, setPostsBasePath] = useState<string | undefined>(undefined);
  const [features, setFeatures] = useState<FeatureBucket[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [i18n, setI18n] = useState<I18nConfig>({ locales: [], defaultLocale: null });
  const refreshIdRef = useRef(0);

  // Cmd+P / openFileByPath operate on the markdown-only projection of the
  // canonical tree. Derived rather than mirrored so it stays in lockstep with
  // tree mutations without explicit setFlatFiles calls.
  const flatFiles: FlatFile[] = useMemo(() => {
    if (!workspaceRoot || !workspaceRootPath) return [];
    return flattenTree(
      forContentMode(tree, {
        workspaceRoot: workspaceRootPath,
        treeRoot: workspaceRoot,
        postsBasePath,
      })
    );
  }, [tree, workspaceRoot, workspaceRootPath, postsBasePath]);

  const refreshTree = useCallback(async (): Promise<FileNode[]> => {
    const requestId = ++refreshIdRef.current;
    try {
      const updated = (await measureAsync("list_workspace_tree.invoke", () =>
        commands.workspace.tree()
      )) as FileNode[];
      if (requestId !== refreshIdRef.current) return updated;
      setTree(updated);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to refresh tree:", err);
      showToast(t("workspace_refresh.refresh_failed", { message }));
      return [];
    }
  }, [showToast, t]);

  const applyWorkspaceResult = useCallback(
    (result: WorkspaceResult) => {
      setTree(result.tree);
      setWorkspaceName(result.name);
      setWorkspaceRoot(result.treeRoot);
      setWorkspaceRootPath(result.rootPath);
      setIsAmytisWorkspace(result.isAmytisWorkspace);
      setAssetRoot(result.assetRoot);
      setCdnBase(result.cdnBase ?? undefined);
      setDefaultAuthor(result.defaultAuthor ?? undefined);
      setPostsBasePath(result.postsBasePath ?? undefined);
      setFeatures(result.features ?? []);
      setAuthors(result.authors ?? []);
      setI18n(result.i18n ?? { locales: [], defaultLocale: null });
      resetFileState();
      if (!result.isAmytisWorkspace) {
        showToast(t("errors.not_amytis_workspace"));
      }
    },
    [resetFileState, showToast, t]
  );

  const openWorkspaceAtPath = useCallback(
    async (path: string) => {
      await flushPendingSave();
      try {
        const result = (await measureAsync(
          "open_workspace_at_path.invoke",
          () => commands.workspace.openAtPath({ path }),
          { path }
        )) as WorkspaceResult | null;
        if (result) {
          applyWorkspaceResult(result);
        } else showToast(t("errors.workspace_path_invalid"));
      } catch (err) {
        console.error("Failed to open workspace:", err);
        showToast(
          t("errors.open_workspace_failed", {
            message: err instanceof Error ? err.message : String(err),
          })
        );
      }
    },
    [flushPendingSave, showToast, t, applyWorkspaceResult]
  );

  const handleCreateAmytisWorkspace = useCallback(
    async (parentDir: string, name: string): Promise<boolean> => {
      try {
        await flushPendingSave();
        const result = (await commands.workspace.createAmytis({
          parentDir,
          name,
        })) as WorkspaceResult;
        applyWorkspaceResult(result);
        return true;
      } catch (err) {
        console.error("Failed to create workspace:", err);
        showToast(
          t("errors.create_workspace_failed", {
            message: err instanceof Error ? err.message : String(err),
          })
        );
        return false;
      }
    },
    [flushPendingSave, showToast, t, applyWorkspaceResult]
  );

  const handleCloneWorkspace = useCallback(
    async (url: string, parentDir: string, name: string | null): Promise<boolean> => {
      try {
        await flushPendingSave();
        const result = (await commands.workspace.clone({
          url,
          parentDir,
          name,
        })) as WorkspaceResult;
        applyWorkspaceResult(result);
        return true;
      } catch (err) {
        console.error("Failed to clone workspace:", err);
        showToast(
          t("errors.clone_workspace_failed", {
            message: err instanceof Error ? err.message : String(err),
          })
        );
        return false;
      }
    },
    [flushPendingSave, showToast, t, applyWorkspaceResult]
  );

  const handleOpenWorkspace = useCallback(async () => {
    await flushPendingSave();
    try {
      const result = (await measureAsync("open_workspace.invoke", () =>
        commands.workspace.open()
      )) as WorkspaceResult | null;
      if (result) {
        applyWorkspaceResult(result);
      }
    } catch (err) {
      console.error("Failed to open workspace:", err);
      showToast(
        t("errors.open_workspace_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }, [flushPendingSave, showToast, t, applyWorkspaceResult]);

  const handleNewTodayFlow = useCallback(async () => {
    if (!workspaceRoot) return;
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dirPath = `${workspaceRoot}/flows/${year}/${month}`;
    const filePath = `${dirPath}/${day}.md`;
    try {
      await commands.files.ensureDir({ path: dirPath });
      try {
        await commands.files.create({ path: filePath, content: createTodayFlowFrontmatter() });
      } catch (err) {
        if (!String(err).includes("already exists")) throw err;
      }
      const updated = await refreshTree();
      const node = findNode(updated, filePath);
      if (node) await onPathCreated?.(node);
    } catch (err) {
      console.error("Failed to open today's flow:", err);
      showToast(
        t("errors.open_today_flow_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }, [workspaceRoot, refreshTree, onPathCreated, showToast, t]);

  async function handleNewFile(dirPath: string, title: string, kind: NewContentKind = "generic") {
    const date = new Date().toISOString().slice(0, 10);
    const contentRoot = workspaceRoot ?? dirPath;
    // Posts (and series-member posts) use the workspace's own template file,
    // mirroring `bun run new`. Falls back to the built-in default if absent.
    let postTemplate: string | undefined;
    if ((kind === "post" || kind === "seriesPost") && workspaceRootPath) {
      try {
        postTemplate = await commands.files.read({
          path: `${workspaceRootPath}/templates/default.mdx`,
        });
      } catch {
        // No template file — buildNewContent uses the built-in default.
      }
    }
    const { dirsToCreate, filePath, content } = buildNewContent(
      {
        kind,
        title,
        date,
        contentRoot,
        basePath: postsBasePath || "posts",
        dirPath,
        postTemplate,
        defaultAuthor,
        format: contentPrefs?.format,
        layout: contentPrefs?.layout,
      },
      t
    );
    try {
      for (const dir of dirsToCreate) {
        await commands.files.ensureDir({ path: dir });
      }
      await commands.files.create({ path: filePath, content });
      const updated = await refreshTree();
      const newNode = findNode(updated, filePath);
      if (newNode) await onPathCreated?.(newNode);
    } catch (err) {
      console.error("Failed to create file:", err);
      showToast(
        t("errors.create_file_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  async function handleRename(node: FileNode, newName: string) {
    await flushPendingSave();
    const { oldPath, newPath } = buildPostTargetPath(node, newName);
    try {
      await commands.files.rename({ oldPath, newPath });
      // Refresh first so the lookup we hand to the session sees the renamed
      // node with full metadata. Calling onPathRenamed before refreshTree
      // (the previous order) made the session resolve the new path against
      // a stale tree and fall back to a synthetic node missing
      // containerDirPath / title / contentType.
      const updated = await refreshTree();
      onPathRenamed?.(oldPath, newPath, (path) => findNode(updated, path));
    } catch (err) {
      console.error("Failed to rename file:", err);
      showToast(
        t("errors.rename_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  async function handleDuplicate(node: FileNode, newName: string) {
    await flushPendingSave();
    const { oldPath, newPath, folderBacked, entryFileName } = buildPostTargetPath(node, newName);

    try {
      await commands.files.duplicate({ srcPath: oldPath, destPath: newPath });
      const updated = await refreshTree();
      const duplicatedPath = folderBacked ? `${newPath}/${entryFileName}` : newPath;
      const duplicated = findNode(updated, duplicatedPath);
      if (duplicated) {
        await onPathCreated?.(duplicated);
      }
    } catch (err) {
      console.error("Failed to duplicate file:", err);
      showToast(
        t("errors.duplicate_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  async function handleNewFromExisting(node: FileNode, newName: string) {
    await flushPendingSave();
    const { newPath, folderBacked, entryFileName } = buildPostTargetPath(node, newName);
    const targetPath = folderBacked ? `${newPath}/${entryFileName}` : newPath;

    if (findNode(tree, newPath)) {
      showToast(t("errors.new_from_existing_conflict", { name: newName }));
      return;
    }

    try {
      const raw = await commands.files.read({ path: node.path });
      const content = createPostFromExistingContent(raw);

      if (folderBacked) {
        await commands.files.ensureDir({ path: newPath });
      }

      await commands.files.create({ path: targetPath, content });
      const updated = await refreshTree();
      const created = findNode(updated, targetPath);
      if (created) {
        await onPathCreated?.(created);
      }
    } catch (err) {
      console.error("Failed to create post from existing:", err);
      showToast(
        t("errors.new_from_existing_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  async function handleDelete(node: FileNode) {
    const targetPath = node.containerDirPath ?? node.path;
    const confirmed = await confirm(t("confirm.move_to_trash", { name: node.name }), {
      title: t("confirm.delete_title"),
      kind: "warning",
    });
    if (!confirmed) return;
    // Always flush — the editor session decides whether the deleted file is
    // the active one and closes it via onPathRemoved. flushPendingSave is a
    // no-op when nothing is pending, so unconditional is safe.
    await flushPendingSave();
    try {
      await commands.files.trash({ path: targetPath });
      await onPathRemoved?.(targetPath);
      await refreshTree();
    } catch (err) {
      console.error("Failed to delete file:", err);
      showToast(
        t("errors.delete_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  // Edit a collection index's `items:` list. Flush first so we don't lose
  // unsaved editor work; the revision poll reloads the editor if the index is
  // the open file. Read-modify-write the whole file via the collection helpers.
  async function mutateCollection(
    indexPath: string,
    transform: (items: CollectionItem[]) => CollectionItem[]
  ) {
    await flushPendingSave();
    try {
      const raw = await commands.files.read({ path: indexPath });
      const next = setCollectionItems(raw, transform(parseCollectionItems(raw)));
      // Read-modify-write of a collection index (not the open editor file); it
      // has no tracked mtime, so force the write.
      await commands.files.write({ path: indexPath, content: next, expectedMtime: null });
      await refreshTree();
    } catch (err) {
      console.error("Failed to update collection:", err);
      showToast(
        t("errors.update_collection_failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  function addCollectionItem(indexPath: string, item: CollectionItem) {
    return mutateCollection(indexPath, (items) => addItem(items, item));
  }

  function removeCollectionItem(indexPath: string, key: string) {
    return mutateCollection(indexPath, (items) => removeItem(items, key));
  }

  return {
    tree,
    flatFiles,
    workspaceName,
    workspaceRoot,
    workspaceRootPath,
    isAmytisWorkspace,
    assetRoot,
    cdnBase,
    defaultAuthor,
    postsBasePath,
    features,
    authors,
    i18n,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleCreateAmytisWorkspace,
    handleCloneWorkspace,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDuplicate,
    handleNewFromExisting,
    handleDelete,
    addCollectionItem,
    removeCollectionItem,
    refreshTree,
  };
}
