import { useCallback, useRef, useState } from "react";

/** Words added to the current file this app run — the "+N" session badge
 *  and the session-goal meter.
 *
 *  The badge sits next to the current document's total, so it is scoped to
 *  that document: a cross-file sum next to a per-file total mixes scopes in
 *  one corner. Each path is baselined at the first count the editor reports
 *  for it this run (the synchronous mount emission always precedes the
 *  debounced typing path, so the baseline is the document's loaded size,
 *  not a mid-typing snapshot). Deltas are kept per path for the whole run —
 *  switching files shows the other file's own progress and switching back
 *  restores this one's; nothing resets on switch. Display clamps at 0 (net
 *  deletions hide the badge). State advances only through explicit editor
 *  reports, never by observing render-time word-count state — baselining
 *  from renders raced the load path and made "+N" equal the document total.
 *  A "session" deliberately ends when Ovid quits; nothing is persisted.
 *
 *  Path lifecycle: renames migrate baselines (progress survives renaming
 *  the file or an ancestor directory) and deletions drop them (a new file
 *  recreated at the same path must not inherit a dead baseline). External
 *  reloads rebaseline — words that arrived via `git pull` are not session
 *  progress, and an external truncation must not swallow the writer's next
 *  genuinely-typed words in the clamp. */
export function useSessionWords(currentPath: string | null) {
  const baselinesRef = useRef(new Map<string, number>());
  const [deltas, setDeltas] = useState<ReadonlyMap<string, number>>(new Map());

  const noteWordCount = useCallback((path: string, count: number) => {
    let baseline = baselinesRef.current.get(path);
    if (baseline === undefined) {
      baseline = count;
      baselinesRef.current.set(path, baseline);
    }
    const delta = count - baseline;
    setDeltas((prev) => {
      if (prev.get(path) === delta) return prev;
      const next = new Map(prev);
      next.set(path, delta);
      return next;
    });
  }, []);

  const rebaselineWordCount = useCallback((path: string, count: number) => {
    baselinesRef.current.set(path, count);
    setDeltas((prev) => {
      if (prev.get(path) === 0) return prev;
      const next = new Map(prev);
      next.set(path, 0);
      return next;
    });
  }, []);

  const notePathRenamed = useCallback((oldPath: string, newPath: string) => {
    const remap = (path: string): string | null => {
      if (path === oldPath) return newPath;
      if (path.startsWith(`${oldPath}/`)) return newPath + path.slice(oldPath.length);
      return null;
    };
    for (const [path, baseline] of [...baselinesRef.current]) {
      const moved = remap(path);
      if (moved !== null) {
        baselinesRef.current.delete(path);
        baselinesRef.current.set(moved, baseline);
      }
    }
    setDeltas((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [path, delta] of prev) {
        const moved = remap(path);
        if (moved !== null) {
          next.delete(path);
          next.set(moved, delta);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const notePathRemoved = useCallback((removedPath: string) => {
    const matches = (path: string) => path === removedPath || path.startsWith(`${removedPath}/`);
    for (const path of [...baselinesRef.current.keys()]) {
      if (matches(path)) baselinesRef.current.delete(path);
    }
    setDeltas((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const path of prev.keys()) {
        if (matches(path)) {
          next.delete(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const sessionWordsAdded = currentPath !== null ? Math.max(0, deltas.get(currentPath) ?? 0) : 0;

  return {
    sessionWordsAdded,
    noteWordCount,
    rebaselineWordCount,
    notePathRenamed,
    notePathRemoved,
  };
}
