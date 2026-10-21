// One bulk IPC read of the content-mode markdown corpus, cached per
// flatFiles identity. flatFiles is a useMemo projection of the canonical
// workspace tree, renewed after every walk (revision change or file
// operation) — which makes this cache effectively revision-keyed without
// extra plumbing. Selection changes and re-renders reuse the cached corpus
// with zero IPC. Consumers: wiki-link resolution and the backlinks scanner.
//
// Ovid's own saves don't cause a walk (the watcher drops them, ADR 0021), so
// the current corpus is patched in memory with each write instead of being
// re-read.

import { commands } from "./commands";
import type { FlatFile } from "./fileSearch";

const corpusByFlatFiles = new WeakMap<FlatFile[], Promise<Map<string, string>>>();
/** The most recently requested corpus — the one the app's consumers read. */
let currentCorpus: Promise<Map<string, string>> | null = null;

/** Told when a write of this app's changed a file in the current corpus. */
export type CorpusEditListener = (path: string, before: string, after: string) => void;
const editListeners = new Set<CorpusEditListener>();

/** Subscribe to in-memory corpus updates from the app's own writes. Returns
 *  an unsubscribe function. */
export function onCorpusEdit(listener: CorpusEditListener): () => void {
  editListeners.add(listener);
  return () => {
    editListeners.delete(listener);
  };
}

/** Bring the current corpus up to date with a write. Applied once the read
 *  in flight (if any) has landed, so it always wins over that read's text.
 *  A path the corpus doesn't hold is a new file: the walk its creation
 *  causes renews the corpus. */
export function recordCorpusWrite(path: string, content: string): void {
  const corpus = currentCorpus;
  if (!corpus) return;
  void corpus
    .then((contents) => {
      const before = contents.get(path);
      if (before === undefined || before === content) return;
      contents.set(path, content);
      for (const listener of editListeners) listener(path, before, content);
    })
    .catch(() => {});
}

commands.files.onWrite(recordCorpusWrite);

/** Contents of every file in `flatFiles`, keyed by absolute path. Entries for
 *  unreadable or oversized files are absent. */
export function readCorpus(flatFiles: FlatFile[]): Promise<Map<string, string>> {
  const cached = corpusByFlatFiles.get(flatFiles);
  if (cached) return cached;
  const load = commands.files
    .readBulk({ paths: flatFiles.map((f) => f.node.path) })
    .then((files) => new Map(files.map((f) => [f.path, f.content])));
  corpusByFlatFiles.set(flatFiles, load);
  currentCorpus = load;
  // A failed bulk read must not poison the cache for this tree generation.
  load.catch(() => {
    if (corpusByFlatFiles.get(flatFiles) === load) corpusByFlatFiles.delete(flatFiles);
    if (currentCorpus === load) currentCorpus = null;
  });
  return load;
}

/** Adapt a corpus map to the `readFile` shape the scanners inject: resolves
 *  the cached content, or rejects like a failed read for absent entries so
 *  callers skip those files. */
export function corpusReadFile(contents: Map<string, string>): (path: string) => Promise<string> {
  return (path) => {
    const content = contents.get(path);
    return content === undefined
      ? Promise.reject(new Error("file not in corpus"))
      : Promise.resolve(content);
  };
}
