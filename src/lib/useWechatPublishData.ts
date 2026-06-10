import { type ParsedFrontmatter, parseFrontmatter } from "./frontmatter";
import type { FileNode } from "./types";
import { countLocalImages, extractExcerpt, hasMathBlocks } from "./wechatHtml";

// Everything the WeChat publish dialog derives from the current file —
// computed next to the dialog instead of being threaded through App as
// eleven separate props.
export interface WechatPublishData {
  title: string;
  author: string;
  digest: string;
  hasMath: boolean;
  imageCount: number;
  markdown: string;
  baseDir: string;
  coverImagePath: string | null;
  mediaId: string | null;
}

export interface WechatPublishSource {
  selectedFile: FileNode | null;
  parsedFrontmatter: ParsedFrontmatter;
  workspaceRootPath: string | null;
  /** site.config `defaultAuthor` — author fallback when frontmatter has none. */
  defaultAuthor: string | null;
  /** In-flight (not yet saved) markdown body, if any. */
  pendingMarkdown: string | null;
  /** Most recent successfully-written file content, if any save happened. */
  lastSavedContent: string | null;
  /** Content as of editor mount — the fallback before any save. */
  fileContent: string;
}

export function computeWechatPublishData({
  selectedFile,
  parsedFrontmatter,
  workspaceRootPath,
  defaultAuthor,
  pendingMarkdown,
  lastSavedContent,
  fileContent,
}: WechatPublishSource): WechatPublishData {
  const baseDir = selectedFile
    ? selectedFile.path.substring(0, selectedFile.path.lastIndexOf("/"))
    : (workspaceRootPath ?? "");

  // Pass the raw coverImage frontmatter value to Rust; Rust resolves
  // root-relative paths (/images/…) against assetRoot and relative paths
  // against baseDir.
  const coverImagePath =
    parsedFrontmatter.coverImage != null && parsedFrontmatter.coverImage !== ""
      ? String(parsedFrontmatter.coverImage)
      : null;

  // Author: frontmatter author → site.config default → empty; blank
  // frontmatter treated as missing.
  const frontmatterAuthor =
    parsedFrontmatter.author != null ? String(parsedFrontmatter.author).trim() : "";
  const author = frontmatterAuthor || (defaultAuthor ?? "");

  // Body source priority: in-flight edit → most recent on-disk content →
  // initial load. fileContent is only updated when the editor mounts a new
  // file, so after an auto-save fires it goes stale; lastSavedContent tracks
  // every successful write and is the right fallback once any save has
  // happened. Nullish (not truthy) check so an empty saved file is honoured
  // rather than falling through to fileContent.
  const body = pendingMarkdown ?? parseFrontmatter(lastSavedContent ?? fileContent).body;

  // Digest: frontmatter excerpt/description → auto-extract from body.
  const digest = (() => {
    if (parsedFrontmatter.excerpt != null && String(parsedFrontmatter.excerpt).trim())
      return String(parsedFrontmatter.excerpt).trim();
    if (parsedFrontmatter.description != null && String(parsedFrontmatter.description).trim())
      return String(parsedFrontmatter.description).trim();
    return extractExcerpt(body);
  })();

  const mediaId =
    parsedFrontmatter.wechatMediaId != null && String(parsedFrontmatter.wechatMediaId).trim()
      ? String(parsedFrontmatter.wechatMediaId).trim()
      : null;

  const title =
    parsedFrontmatter.title != null
      ? String(parsedFrontmatter.title)
      : (selectedFile?.name.replace(/\.mdx?$/, "") ?? "");

  return {
    title,
    author,
    digest,
    hasMath: hasMathBlocks(body),
    imageCount: countLocalImages(body),
    markdown: body,
    baseDir,
    coverImagePath,
    mediaId,
  };
}
