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
 *  A "session" deliberately ends when Ovid quits; nothing is persisted. */
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

  const sessionWordsAdded = currentPath !== null ? Math.max(0, deltas.get(currentPath) ?? 0) : 0;

  return { sessionWordsAdded, noteWordCount };
}
