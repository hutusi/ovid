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
  /** Trimmed line content for visual context, with `[[…]]` rendered as their
   *  display label (e.g. `[[Foo]]` → `Foo`, `[[Foo|bar]]` → `bar`) so the
   *  snippet reads as prose rather than raw markdown. */
  snippet: string;
}

const WIKI_LINK_RE = /\[\[([^[\]\n]+)\]\]/g;

/** Render `[[Target]]` / `[[Target|Display]]` patterns in a snippet line as
 *  their human-readable label, so the backlinks panel doesn't show raw
 *  bracket syntax. Other markdown (bold, italics, code spans) is left as-is
 *  — the snippet is a single-line preview, not a fully rendered view.
 *
 *  Two normalisation passes:
 *    1. Drop backslash-escapes of `[` / `]`. Files saved by older Ovid
 *       versions (before the WikiLink node existed) or by other markdown
 *       tools use the standard text-escape `\[\[Foo\]\]` for literal
 *       brackets; without unescaping, those leak as visible backslashes
 *       into the snippet.
 *    2. Rewrite the (now-unescaped) wiki-link patterns to their label. */
export function formatBacklinkSnippet(line: string): string {
  return line.replace(/\\([[\]])/g, "$1").replace(WIKI_LINK_RE, (_match, inner: string) => {
    const { target, displayText } = parseWikiLink(inner);
    return displayText ?? target;
  });
}

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
    // Match `[[` directly OR after backslash-escapes (old format) — a file
    // saved by Obsidian or an older Ovid that escaped its literal brackets
    // would otherwise look unlinked even though the references are real.
    if (!body.includes("[[") && !body.includes("\\[")) continue;
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Normalise backslash-escaped brackets up-front so the regex sees
      // `[[Foo]]` whether the file stores it escaped or not, and so the
      // snippet picks up the same normalisation for free.
      const line = lines[i].replace(/\\([[\]])/g, "$1");
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
          snippet: formatBacklinkSnippet(line.trim()),
        });
      }
    }
  }
  return results;
}
