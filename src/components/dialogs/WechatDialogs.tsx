import { lazy, Suspense, useMemo } from "react";
import type { Author } from "../../lib/commands/generated/Author";
import type { ParsedFrontmatter } from "../../lib/frontmatter";
import type { FileNode } from "../../lib/types";
import type { OverlayStack } from "../../lib/useOverlayStack";
import { computeWechatPublishData } from "../../lib/useWechatPublishData";

const WechatPublishDialog = lazy(async () => ({
  default: (await import("../WechatPublishDialog")).WechatPublishDialog,
}));

export interface WechatDialogsProps {
  overlay: OverlayStack;
  selectedFile: FileNode | null;
  parsedFrontmatter: ParsedFrontmatter;
  workspaceRootPath: string | null;
  defaultAuthor: string | null;
  /** In-flight (unsaved) markdown body — read at open time so the publish
   * reflects edits that haven't hit disk yet. */
  pendingMarkdownRef: React.RefObject<string | null>;
  /** Most recent successfully-written content. */
  lastSavedContentRef: React.RefObject<string | null>;
  fileContent: string;
  authors: Author[];
  assetRoot: string | undefined;
  onSuccess: (mediaId: string, updated: boolean) => void;
}

/** The WeChat publish overlay. Derives everything the dialog needs from the
 * current file here — gated on the overlay being open, so the digest/image
 * scans don't run on every App render. */
export function WechatDialogs({
  overlay,
  selectedFile,
  parsedFrontmatter,
  workspaceRootPath,
  defaultAuthor,
  pendingMarkdownRef,
  lastSavedContentRef,
  fileContent,
  authors,
  assetRoot,
  onSuccess,
}: WechatDialogsProps) {
  const open = overlay.is("wechatPublish") && selectedFile !== null;

  // The refs are intentionally read inside the memo: their current values
  // matter at the moment the dialog opens, and the dialog snapshots its
  // form state on mount anyway.
  const data = useMemo(() => {
    if (!open) return null;
    return computeWechatPublishData({
      selectedFile,
      parsedFrontmatter,
      workspaceRootPath,
      defaultAuthor,
      pendingMarkdown: pendingMarkdownRef.current,
      lastSavedContent: lastSavedContentRef.current,
      fileContent,
    });
  }, [
    open,
    selectedFile,
    parsedFrontmatter,
    workspaceRootPath,
    defaultAuthor,
    pendingMarkdownRef,
    lastSavedContentRef,
    fileContent,
  ]);

  if (!open || !data || !selectedFile) return null;

  return (
    <Suspense fallback={null}>
      <WechatPublishDialog
        title={data.title}
        author={data.author}
        authors={authors}
        excerpt={data.digest}
        hasMath={data.hasMath}
        imageCount={data.imageCount}
        markdown={data.markdown}
        baseDir={data.baseDir}
        filePath={selectedFile.path}
        assetRoot={assetRoot}
        coverImagePath={data.coverImagePath}
        existingMediaId={data.mediaId}
        onClose={() => overlay.close("wechatPublish")}
        onSuccess={onSuccess}
      />
    </Suspense>
  );
}
