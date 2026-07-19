// One bulk IPC read of the content-mode markdown corpus, cached per
// flatFiles identity. flatFiles is a useMemo projection of the canonical
// workspace tree, so a new array appears exactly when the tree was re-walked
// (revision change or file operation) — which makes this cache effectively
// revision-keyed without extra plumbing. Selection changes and re-renders
// reuse the cached corpus with zero IPC. Consumers: wiki-link resolution and
// the backlinks scanner.

import { commands } from "./commands";
import type { FlatFile } from "./fileSearch";

const corpusByFlatFiles = new WeakMap<FlatFile[], Promise<Map<string, string>>>();

/** Contents of every file in `flatFiles`, keyed by absolute path. Entries for
 *  unreadable or oversized files are absent. */
export function readCorpus(flatFiles: FlatFile[]): Promise<Map<string, string>> {
  const cached = corpusByFlatFiles.get(flatFiles);
  if (cached) return cached;
  const load = commands.files
    .readBulk({ paths: flatFiles.map((f) => f.node.path) })
    .then((files) => new Map(files.map((f) => [f.path, f.content])));
  corpusByFlatFiles.set(flatFiles, load);
  // A failed bulk read must not poison the cache for this tree generation.
  load.catch(() => {
    if (corpusByFlatFiles.get(flatFiles) === load) corpusByFlatFiles.delete(flatFiles);
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
