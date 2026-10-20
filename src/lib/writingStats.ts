import { useSyncExternalStore } from "react";
import type { WordCountKind } from "./types";

/** Word counts and this session's progress, per file.
 *
 *  Kept outside React state on purpose: the editor reports a count every few
 *  hundred milliseconds while you type, and as App state each report
 *  re-rendered the whole window. Here only the status-bar readout subscribes
 *  (useWritingStats), so typing re-renders just that.
 *
 *  Session progress ("+N" next to the total, and the session-goal meter) is
 *  words added to a file during this app run, so it is scoped per file. Each
 *  path is baselined at the first count the editor reports for it this run
 *  (the synchronous mount emission always precedes the debounced typing
 *  path, so the baseline is the document's loaded size, not a mid-typing
 *  snapshot). Deltas persist for the whole run — switching files shows the
 *  other file's own progress, switching back restores this one's. Display
 *  clamps at 0 (net deletions hide the badge). Progress advances only through
 *  explicit editor reports; baselining from render-time state raced the load
 *  path and made "+N" equal the document total. A session ends when Ovid
 *  quits; nothing is persisted.
 *
 *  Path lifecycle: renames migrate counts and baselines (progress survives
 *  renaming the file or an ancestor folder), deletions drop them (a file
 *  recreated at the same path must not inherit a dead baseline), and
 *  external reloads rebaseline — words that arrived via `git pull` are not
 *  session progress, and an external truncation must not swallow the next
 *  genuinely typed words in the clamp. */
export interface WritingStatsSnapshot {
  readonly counts: ReadonlyMap<string, number>;
  readonly deltas: ReadonlyMap<string, number>;
}

export interface WritingStats {
  /** Record the editor's count for `path`. "reload" rebaselines. */
  report(path: string, count: number, kind?: WordCountKind): void;
  pathRenamed(oldPath: string, newPath: string): void;
  pathRemoved(removedPath: string): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): WritingStatsSnapshot;
}

export function createWritingStats(): WritingStats {
  const baselines = new Map<string, number>();
  let snapshot: WritingStatsSnapshot = { counts: new Map(), deltas: new Map() };
  const listeners = new Set<() => void>();

  const publish = (next: WritingStatsSnapshot) => {
    if (next.counts === snapshot.counts && next.deltas === snapshot.deltas) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  /** Copy-on-write update of one path in a map; returns the same map when
   *  the value is unchanged, so an identical report notifies nobody. */
  const withValue = (map: ReadonlyMap<string, number>, path: string, value: number) => {
    if (map.get(path) === value) return map;
    const next = new Map(map);
    next.set(path, value);
    return next;
  };

  const remapPaths = (
    map: ReadonlyMap<string, number>,
    remap: (path: string) => string | null
  ): ReadonlyMap<string, number> => {
    let changed = false;
    const next = new Map<string, number>();
    for (const [path, value] of map) {
      const moved = remap(path);
      if (moved !== path) changed = true;
      if (moved !== null) next.set(moved, value);
    }
    return changed ? next : map;
  };

  return {
    report(path, count, kind) {
      let baseline = baselines.get(path);
      if (kind === "reload" || baseline === undefined) {
        baseline = count;
        baselines.set(path, baseline);
      }
      publish({
        counts: withValue(snapshot.counts, path, count),
        deltas: withValue(snapshot.deltas, path, count - baseline),
      });
    },

    pathRenamed(oldPath, newPath) {
      const remap = (path: string): string => {
        if (path === oldPath) return newPath;
        if (path.startsWith(`${oldPath}/`)) return newPath + path.slice(oldPath.length);
        return path;
      };
      for (const [path, baseline] of [...baselines]) {
        const moved = remap(path);
        if (moved !== path) {
          baselines.delete(path);
          baselines.set(moved, baseline);
        }
      }
      publish({
        counts: remapPaths(snapshot.counts, remap),
        deltas: remapPaths(snapshot.deltas, remap),
      });
    },

    pathRemoved(removedPath) {
      const removed = (path: string) => path === removedPath || path.startsWith(`${removedPath}/`);
      for (const path of [...baselines.keys()]) {
        if (removed(path)) baselines.delete(path);
      }
      const keep = (path: string) => (removed(path) ? null : path);
      publish({
        counts: remapPaths(snapshot.counts, keep),
        deltas: remapPaths(snapshot.deltas, keep),
      });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },
  };
}

/** The open file's word count and session progress, re-rendering only the
 *  calling component when they change. */
export function useWritingStats(
  stats: WritingStats,
  path: string | null
): { wordCount: number; sessionWordsAdded: number } {
  const snapshot = useSyncExternalStore(stats.subscribe, stats.getSnapshot);
  if (path === null) return { wordCount: 0, sessionWordsAdded: 0 };
  return {
    wordCount: snapshot.counts.get(path) ?? 0,
    sessionWordsAdded: Math.max(0, snapshot.deltas.get(path) ?? 0),
  };
}
