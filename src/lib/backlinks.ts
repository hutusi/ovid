// Backlinks: find every file in the workspace that contains a `[[Target]]`
// reference resolving to a given note. Pure scanner — takes injected file
// reads, the same NoteResolverIndex the editor uses, and returns a flat list
// of `{ sourcePath, lineNumber, snippet }` rows.
//
// Scanning happens lazily (when the panel is first opened for a file) and is
// memoised at the call site. The regex is deliberately permissive: any
// `[[…]]` on a single line counts, regardless of whether it's inside a code
// fence — code blocks rarely contain wiki links by accident, and treating
// the document as flat text keeps the scanner orders of magnitude simpler
// than a markdown-aware traversal.

import type { FlatFile } from "./fileSearch";
import { parseFrontmatter } from "./frontmatter";
import { type NoteResolverIndex, parseWikiLink, resolveWikiTarget } from "./wikiLink";

export interface Backlink {
  /** Absolute file path of the source file (for `openByPath`). */
  sourcePath: string;
  /** Workspace-relative path of the source file. */
  sourceRelativePath: string;
  /** Frontmatter title or filename basename of the source file. */
  sourceTitle: string;
  /** 1-based line number where the link appears. */
  lineNumber: number;
  /** Trimmed line content for visual context. */
  snippet: string;
}

const WIKI_LINK_RE = /\[\[([^[\]\n]+)\]\]/g;

export interface FindBacklinksContext {
  flatFiles: FlatFile[];
  readFile: (path: string) => Promise<string>;
  resolverIndex: NoteResolverIndex;
  /** Source file to skip (typically the target itself). Workspace-relative. */
  excludeRelativePath?: string;
}

/** Find every file that contains a `[[…]]` reference resolving to
 *  `targetRelativePath`. Unreadable files are skipped silently. */
export async function findBacklinks(
  targetRelativePath: string,
  ctx: FindBacklinksContext
): Promise<Backlink[]> {
  const results: Backlink[] = [];
  for (const file of ctx.flatFiles) {
    if (file.relativePath === ctx.excludeRelativePath) continue;
    let raw: string;
    try {
      raw = await ctx.readFile(file.node.path);
    } catch {
      continue;
    }
    // Strip frontmatter so a `title:` value that happens to contain `[[…]]`
    // syntax (rare but legal YAML) doesn't masquerade as an editor reference.
    const { body } = parseFrontmatter(raw);
    if (!body.includes("[[")) continue;
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      WIKI_LINK_RE.lastIndex = 0;
      let matched = false;
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop.
      while ((m = WIKI_LINK_RE.exec(line)) !== null) {
        const { target } = parseWikiLink(m[1]);
        const resolved = resolveWikiTarget(target, ctx.resolverIndex);
        if (resolved.relativePath === targetRelativePath) {
          matched = true;
          break;
        }
      }
      if (matched) {
        results.push({
          sourcePath: file.node.path,
          sourceRelativePath: file.relativePath,
          sourceTitle: file.displayName,
          lineNumber: i + 1,
          snippet: line.trim(),
        });
      }
    }
  }
  return results;
}
