import { useCallback, useRef } from "react";
import { type CollectionItem, collectionCandidates } from "./collection";
import type { FlatFile } from "./fileSearch";
import { getDirIndexEntry } from "./sidebarUtils";
import type { FileNode } from "./types";
import { useCollectionLinks } from "./useCollectionLinks";
import type { OverlayStack } from "./useOverlayStack";

interface UseCollectionActionsOptions {
  tree: FileNode[];
  flatFiles: FlatFile[];
  workspaceRoot: string | null;
  postsBasePath?: string;
  overlay: OverlayStack;
  addCollectionItem: (indexPath: string, item: CollectionItem) => Promise<void>;
  removeCollectionItem: (indexPath: string, key: string) => Promise<void>;
}

/** Collection (`type: collection` series) links for the sidebar, and the
 *  add/remove actions on them. Every returned callback is stable, so the
 *  memoized sidebar rows that receive them don't re-render on App renders. */
export function useCollectionActions({
  tree,
  flatFiles,
  workspaceRoot,
  postsBasePath,
  overlay,
  addCollectionItem,
  removeCollectionItem,
}: UseCollectionActionsOptions) {
  const { links: collectionLinks, reload } = useCollectionLinks({
    tree,
    flatFiles,
    contentRoot: workspaceRoot,
    postsBasePath,
  });

  // Latest values for the stable callbacks below.
  const latest = useRef({ collectionLinks, addCollectionItem, removeCollectionItem, overlay });
  latest.current = { collectionLinks, addCollectionItem, removeCollectionItem, overlay };

  const handleAddToCollection = useCallback((collectionDir: FileNode) => {
    const index = getDirIndexEntry(collectionDir);
    if (!index) return;
    const existing: CollectionItem[] = (
      latest.current.collectionLinks.get(collectionDir.path) ?? []
    ).map((link) => (link.kind === "series" ? { series: link.slug } : { post: link.slug }));
    latest.current.overlay.open({
      kind: "modal",
      state: { type: "add-to-collection", indexPath: index.path, existing },
    });
  }, []);

  const handleRemoveFromCollection = useCallback(
    async (indexPath: string, key: string) => {
      await latest.current.removeCollectionItem(indexPath, key);
      reload();
    },
    [reload]
  );

  const handleAddCollectionItem = useCallback(
    async (indexPath: string, item: CollectionItem) => {
      await latest.current.addCollectionItem(indexPath, item);
      reload();
    },
    [reload]
  );

  const collectionCandidatesFor = useCallback(
    (existing: CollectionItem[], selfIndexPath: string) =>
      collectionCandidates(
        flatFiles,
        { contentRoot: workspaceRoot ?? "", postsBasePath },
        existing,
        selfIndexPath
      ),
    [flatFiles, workspaceRoot, postsBasePath]
  );

  return {
    collectionLinks,
    handleAddToCollection,
    handleRemoveFromCollection,
    handleAddCollectionItem,
    collectionCandidatesFor,
  };
}
