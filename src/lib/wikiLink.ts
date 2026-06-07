import { slugify } from "./amytisScaffold";
import type { FlatFile } from "./fileSearch";
import { parseYamlFrontmatter } from "./frontmatter";

// Wiki-link resolution is intentionally scoped to notes (the `notes/` bucket).
// Matching is by frontmatter `title:` or `aliases:` only — never by filename
// slug — so notes can be renamed freely without breaking references, and the
// `aliases:` field that the Amytis note scaffold already creates becomes the
// canonical cross-naming mechanism.

export interface NoteFrontmatterEntry {
  title?: string;
  aliases?: string[];
}

export interface NoteResolverIndex {
  /** Workspace-relative note path → its frontmatter title/aliases. */
  byPath: Map<string, NoteFrontmatterEntry>;
  /** Lowercased title → workspace-relative path. */
  byTitle: Map<string, string>;
  /** Lowercased alias → workspace-relative path. */
  byAlias: Map<string, string>;
}

export const EMPTY_NOTE_RESOLVER_INDEX: NoteResolverIndex = {
  byPath: new Map(),
  byTitle: new Map(),
  byAlias: new Map(),
};

export interface ResolvedWikiTarget {
  /** Workspace-relative path (e.g. `notes/hello-world.md`). */
  relativePath: string;
  /** True when an existing note was matched; false means "would be created". */
  exists: boolean;
}

/** Parse a raw wiki-link payload. Supports `Target` and `Target|Display`. */
export interface ParsedWikiLink {
  target: string;
  displayText: string | null;
}

export function parseWikiLink(raw: string): ParsedWikiLink {
  const pipeIndex = raw.indexOf("|");
  if (pipeIndex === -1) {
    return { target: raw.trim(), displayText: null };
  }
  const target = raw.slice(0, pipeIndex).trim();
  const displayText = raw.slice(pipeIndex + 1).trim();
  return { target, displayText: displayText.length > 0 ? displayText : null };
}

/** True when a flat file lives in the `notes/` bucket. */
export function isNoteFlatFile(file: FlatFile): boolean {
  return file.relativePath === "notes" || file.relativePath.startsWith("notes/");
}

export function filterNotes(flatFiles: FlatFile[]): FlatFile[] {
  return flatFiles.filter(isNoteFlatFile);
}

/** Resolve a wiki target to a path. Priority: aliases > title (case-insensitive).
 *  No match → `notes/<slugify(target)>.md` with `exists: false`. */
export function resolveWikiTarget(target: string, index: NoteResolverIndex): ResolvedWikiTarget {
  const key = target.trim().toLowerCase();
  if (key.length > 0) {
    const aliasHit = index.byAlias.get(key);
    if (aliasHit) return { relativePath: aliasHit, exists: true };
    const titleHit = index.byTitle.get(key);
    if (titleHit) return { relativePath: titleHit, exists: true };
  }
  return { relativePath: `notes/${slugify(target)}.md`, exists: false };
}

/** Build a resolver index from notes-bucket flat files by reading their
 *  frontmatter via the injected `readFile`. Unreadable files are skipped. */
export async function buildNoteResolverIndex(
  flatFiles: FlatFile[],
  readFile: (path: string) => Promise<string>
): Promise<NoteResolverIndex> {
  const index: NoteResolverIndex = {
    byPath: new Map(),
    byTitle: new Map(),
    byAlias: new Map(),
  };
  for (const note of filterNotes(flatFiles)) {
    let raw: string;
    try {
      raw = await readFile(note.node.path);
    } catch {
      continue;
    }
    const fm = parseYamlFrontmatter(raw);
    const title = typeof fm.title === "string" ? fm.title : undefined;
    const aliases = Array.isArray(fm.aliases) ? fm.aliases : undefined;
    index.byPath.set(note.relativePath, { title, aliases });
    if (title) {
      const key = title.toLowerCase();
      // First write wins so the same title in two notes consistently resolves
      // to the alphabetically/structurally-first one rather than flipping on
      // tree refreshes.
      if (!index.byTitle.has(key)) index.byTitle.set(key, note.relativePath);
    }
    if (aliases) {
      for (const alias of aliases) {
        if (typeof alias !== "string") continue;
        const key = alias.toLowerCase();
        if (!index.byAlias.has(key)) index.byAlias.set(key, note.relativePath);
      }
    }
  }
  return index;
}
