import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { FileImage, FileText, Folder, FolderOpen } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { NewContentKind } from "../../lib/amytisScaffold";
import type { CollectionLink } from "../../lib/collection";
import type { FeatureBucket } from "../../lib/commands/generated/FeatureBucket";
import { resolveEntryLabelClick } from "../../lib/sidebarExpansion";
import {
  bucketLabel,
  getBucketContentType,
  getDirIndexEntry,
  getSidebarDisplayName,
  needsPageDivider,
  rollupGitStatus,
} from "../../lib/sidebarUtils";
import type { FileNode, GitStatus } from "../../lib/types";
import { ContentTypeIcon } from "../ContentTypeIcon";
import { isReadOnlyContent } from "../FileViewer";
import { CollectionLinkRow } from "./CollectionLinkRow";
import "../Sidebar.css";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);

// Maps an inferred folder content type to the i18n key for its "New X" action.
// "flow" is handled separately (it triggers today's flow, not the name dialog).
const NEW_TYPE_LABEL_KEYS: Record<string, string> = {
  post: "menu.file_new_post",
  note: "menu.file_new_note",
  series: "menu.file_new_series",
  book: "menu.file_new_book",
  page: "menu.file_new_page",
};

export interface FileItemProps {
  node: FileNode;
  depth: number;
  isExpanded: (node: FileNode, depth: number) => boolean;
  onToggleExpand: (path: string, depth: number, opts?: { isBucket?: boolean }) => void;
  selectedPath: string | null;
  gitStatusMap: Map<string, GitStatus>;
  forceExpand?: boolean;
  filesMode: boolean;
  /** Content type of the top-level bucket this node lives under (e.g. "series"
   *  for everything inside `content/series/`). Threaded down the tree so a
   *  nested folder knows its bucket without re-deriving it from the path. */
  bucketType?: string;
  /** `posts.basePath` from site.config — only consulted at depth 0. */
  postsBasePath?: string;
  /** Content buckets from site.config `features:` — used for localized labels. */
  features?: FeatureBucket[];
  collectionLinks?: Map<string, CollectionLink[]>;
  onSelect: (node: FileNode) => void;
  onNewFile: (dirPath: string, kind: NewContentKind) => void;
  onNewTodayFlow: () => void;
  onAddToCollection: (collectionDir: FileNode) => void;
  onRemoveFromCollection: (indexPath: string, key: string) => void;
  onRename: (node: FileNode) => void;
  onDuplicate: (node: FileNode) => void;
  onNewFromExisting: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
}

export function FileItem({
  node,
  depth,
  isExpanded,
  onToggleExpand,
  selectedPath,
  gitStatusMap,
  forceExpand = false,
  filesMode,
  bucketType,
  postsBasePath,
  features,
  collectionLinks,
  onSelect,
  onNewFile,
  onNewTodayFlow,
  onAddToCollection,
  onRemoveFromCollection,
  onRename,
  onDuplicate,
  onNewFromExisting,
  onDelete,
}: FileItemProps) {
  const { t, i18n } = useTranslation();
  const expanded = forceExpand || isExpanded(node, depth);
  const isSelected = node.path === selectedPath;
  const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
  const indent = `${12 + depth * 14}px`;
  // A top-level content directory is a bucket; its name maps to a content type.
  // Nested folders inherit the bucket type threaded from their parent.
  const effectiveBucketType =
    depth === 0
      ? node.isDirectory
        ? getBucketContentType(node.name, postsBasePath)
        : undefined
      : bucketType;
  // Entry folder = a directory holding an index.md(x) (series/book/collection).
  // A collection's index is typed `collection`; its members are referenced via
  // `items:` and rendered as links rather than in-folder children.
  const indexEntry = node.isDirectory && !filesMode ? getDirIndexEntry(node) : undefined;
  const isCollection = indexEntry?.contentType === "collection";

  async function showDirContextMenu() {
    // Top-level directories in content mode are the structural content-type
    // buckets (flows, notes, posts, series, …). They can hold new content but
    // must not be renamed or deleted.
    const isBucket = depth === 0 && node.isDirectory;
    const protectedBucket = !filesMode && isBucket;
    // Layer-aware "New X". The bucket folder (depth 0) offers "New <Type>";
    // inside a series/book the folder offers a member post/chapter. Type comes
    // from the bucket folder, since Amytis files carry no `type:` frontmatter.
    const bt = filesMode ? undefined : effectiveBucketType;
    let newItem: MenuItem;
    if (isCollection) {
      // A collection's members live elsewhere; edit the `items:` list instead
      // of creating files inside the folder.
      newItem = await MenuItem.new({
        text: t("sidebar.add_to_collection"),
        action: () => onAddToCollection(node),
      });
    } else if (isBucket && bt === "flow") {
      newItem = await MenuItem.new({
        text: t("menu.file_new_flow"),
        action: () => onNewTodayFlow(),
      });
    } else if (isBucket && bt && NEW_TYPE_LABEL_KEYS[bt]) {
      newItem = await MenuItem.new({
        text: t(NEW_TYPE_LABEL_KEYS[bt]),
        action: () => onNewFile(node.path, bt as NewContentKind),
      });
    } else if (!isBucket && bt === "series") {
      // Inside a series: create a flat member post (no date prefix).
      newItem = await MenuItem.new({
        text: t("menu.file_new_post"),
        action: () => onNewFile(node.path, "seriesPost"),
      });
    } else if (!isBucket && bt === "book") {
      // Inside a book: create a chapter.
      newItem = await MenuItem.new({
        text: t("sidebar.new_chapter"),
        action: () => onNewFile(node.path, "chapter"),
      });
    } else {
      newItem = await MenuItem.new({
        text: t("sidebar.new_file_here"),
        action: () => onNewFile(node.path, "generic"),
      });
    }
    const items = protectedBucket
      ? [newItem]
      : [
          newItem,
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({ text: t("sidebar.rename"), action: () => onRename(node) }),
          await MenuItem.new({ text: t("sidebar.delete"), action: () => onDelete(node) }),
        ];
    const menu = await Menu.new({ items });
    await menu.popup();
  }

  if (node.isDirectory) {
    const DirIcon = expanded ? FolderOpen : Folder;
    // Top-level Content-mode buckets show their type icon instead of a generic
    // folder. Entry folders and Files mode keep Folder/FolderOpen so the
    // open/closed visual signal stays intact.
    const isBucketFolder = depth === 0 && !filesMode && !!effectiveBucketType;
    const dirIconNode = isBucketFolder ? (
      <ContentTypeIcon
        type={effectiveBucketType}
        size={13}
        className="sidebar-file-icon sidebar-dir-icon"
      />
    ) : (
      <DirIcon size={13} className="sidebar-file-icon sidebar-dir-icon" />
    );
    const dirRollup = !expanded ? rollupGitStatus(node, gitStatusMap) : undefined;
    // An entry folder's label is the index's title; clicking it opens the
    // index, the chevron toggles expansion, and the index child is hidden.
    const childNodes = indexEntry
      ? (node.children ?? []).filter((child) => child.path !== indexEntry.path)
      : (node.children ?? []);
    const collectionItems = isCollection ? (collectionLinks?.get(node.path) ?? []) : null;
    // Top-level buckets get their localized `features:` name; entry folders keep
    // the index title; everything else falls back to the raw folder name.
    const bucketDisplayName =
      depth === 0 && !filesMode
        ? bucketLabel(node.name, { features, postsBasePath, locale: i18n.language, translate: t })
        : node.name;
    const dirLabel = indexEntry ? getSidebarDisplayName(indexEntry) : bucketDisplayName;
    const entrySelected = indexEntry?.path === selectedPath;
    const dirRollupDot = dirRollup ? (
      <span
        className={`git-dot git-dot-${dirRollup}`}
        title={t("sidebar.changes_inside", { status: dirRollup })}
      />
    ) : null;
    return (
      <div>
        <div
          role="none"
          className={`sidebar-dir-row${indexEntry ? " entry" : ""}${
            entrySelected ? " selected" : ""
          }`}
          style={{ paddingLeft: indent }}
          onContextMenu={(e) => {
            e.preventDefault();
            showDirContextMenu();
          }}
        >
          {indexEntry ? (
            <>
              <button
                type="button"
                className="sidebar-dir-toggle"
                aria-expanded={expanded}
                aria-label={t("sidebar.toggle_section", { name: dirLabel })}
                onClick={() => onToggleExpand(node.path, depth, { isBucket: isBucketFolder })}
              >
                {dirIconNode}
              </button>
              <button
                type="button"
                className="sidebar-dir-label"
                onClick={() => {
                  // Re-clicking an already-shown index collapses the row; the
                  // collapse path skips onSelect so selectedPath stays stable
                  // and the auto-expand-ancestors effect doesn't re-open it.
                  const action = resolveEntryLabelClick({ entrySelected, expanded });
                  if (action === "collapse") {
                    onToggleExpand(node.path, depth, { isBucket: isBucketFolder });
                    return;
                  }
                  if (action === "expand-and-select")
                    onToggleExpand(node.path, depth, { isBucket: isBucketFolder });
                  onSelect(indexEntry);
                }}
              >
                <span className="sidebar-file-name">{dirLabel}</span>
                {dirRollupDot}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`sidebar-dir${isBucketFolder ? " sidebar-bucket-row" : ""}${
                node.disabledForSite ? " disabled-for-site" : ""
              }`}
              aria-expanded={expanded}
              onClick={() => onToggleExpand(node.path, depth, { isBucket: isBucketFolder })}
            >
              {dirIconNode}
              <span className="sidebar-bucket-label">{dirLabel}</span>
              {isBucketFolder && (
                <span className="sidebar-bucket-count" aria-hidden="true">
                  {node.children?.length ?? 0}
                </span>
              )}
              {node.disabledForSite && (
                <span className="sidebar-bucket-badge" title={t("sidebar.hidden_from_site")}>
                  {t("sidebar.hidden_badge")}
                </span>
              )}
              {dirRollupDot}
            </button>
          )}
        </div>
        {expanded &&
          collectionItems !== null &&
          indexEntry &&
          collectionItems.map((link) => (
            <CollectionLinkRow
              key={link.key}
              link={link}
              depth={depth + 1}
              indexPath={indexEntry.path}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onRemoveFromCollection={onRemoveFromCollection}
            />
          ))}
        {expanded &&
          collectionItems === null &&
          childNodes.map((child, idx, sorted) => (
            <Fragment key={child.path}>
              {!filesMode && needsPageDivider(sorted, idx) && (
                <div className="sidebar-section-divider" />
              )}
              <FileItem
                node={child}
                depth={depth + 1}
                isExpanded={isExpanded}
                onToggleExpand={onToggleExpand}
                selectedPath={selectedPath}
                gitStatusMap={gitStatusMap}
                forceExpand={forceExpand}
                filesMode={filesMode}
                bucketType={effectiveBucketType}
                collectionLinks={collectionLinks}
                onSelect={onSelect}
                onNewFile={onNewFile}
                onNewTodayFlow={onNewTodayFlow}
                onAddToCollection={onAddToCollection}
                onRemoveFromCollection={onRemoveFromCollection}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onNewFromExisting={onNewFromExisting}
                onDelete={onDelete}
              />
            </Fragment>
          ))}
      </div>
    );
  }

  if (!isMarkdown && !isReadOnlyContent(node) && !filesMode) return null;

  const ext = (node.extension?.replace(".", "") ?? node.name.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const displayName = !filesMode && isMarkdown ? getSidebarDisplayName(node) : node.name;
  const gitStatus = gitStatusMap.get(node.path);

  async function showMarkdownContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({ text: t("sidebar.make_copy"), action: () => onDuplicate(node) }),
        await MenuItem.new({
          text: t("sidebar.new_from_existing"),
          action: () => onNewFromExisting(node),
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await MenuItem.new({ text: t("sidebar.rename"), action: () => onRename(node) }),
        await MenuItem.new({ text: t("sidebar.delete"), action: () => onDelete(node) }),
      ],
    });
    await menu.popup();
  }

  async function showNonMarkdownContextMenu() {
    const menu = await Menu.new({
      items: [
        await MenuItem.new({ text: t("sidebar.rename"), action: () => onRename(node) }),
        await MenuItem.new({ text: t("sidebar.delete"), action: () => onDelete(node) }),
      ],
    });
    await menu.popup();
  }

  return (
    <>
      <div
        role="none"
        className={`sidebar-file-row ${isSelected ? "selected" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          if (isMarkdown) showMarkdownContextMenu();
          else showNonMarkdownContextMenu();
        }}
      >
        <button
          type="button"
          className="sidebar-file"
          style={{ paddingLeft: indent }}
          onClick={() => onSelect(node)}
          onKeyDown={(e) => {
            if (e.key === "F2") onRename(node);
          }}
        >
          <span className="sidebar-file-icon-wrap">
            {isMarkdown ? (
              <ContentTypeIcon type={node.contentType} className="sidebar-file-icon" />
            ) : isImage ? (
              <FileImage size={13} className="sidebar-file-icon sidebar-file-icon-generic" />
            ) : (
              <FileText size={13} className="sidebar-file-icon sidebar-file-icon-generic" />
            )}
            {node.containerDirPath && <span className="sidebar-file-icon-badge" />}
          </span>
          <span className={node.draft ? "sidebar-file-name draft" : "sidebar-file-name"}>
            {displayName}
          </span>
          {gitStatus && <span className={`git-dot git-dot-${gitStatus}`} title={gitStatus} />}
        </button>
      </div>
      {node.translations?.map((translation) => {
        const trSelected = translation.path === selectedPath;
        const trGit = gitStatusMap.get(translation.path);
        return (
          <div
            key={translation.path}
            role="none"
            className={`sidebar-file-row ${trSelected ? "selected" : ""}`}
          >
            <button
              type="button"
              className="sidebar-file"
              style={{ paddingLeft: `${12 + (depth + 1) * 14}px` }}
              onClick={() => onSelect(translation)}
            >
              <span className="sidebar-file-icon-wrap">
                <span className="sidebar-locale-badge">
                  {(translation.locale ?? "").toUpperCase()}
                </span>
              </span>
              <span className="sidebar-file-name">{displayName}</span>
              {trGit && <span className={`git-dot git-dot-${trGit}`} title={trGit} />}
            </button>
          </div>
        );
      })}
    </>
  );
}
