import { useCallback, useRef, useState } from "react";

/** Net words added across all files this app run — the "+N" session badge
 *  and the session-goal meter.
 *
 *  Each path is baselined at the first count the editor reports for it this
 *  run (the synchronous mount emission always precedes the debounced typing
 *  path, so the baseline is the document's loaded size, not a mid-typing
 *  snapshot). Re-opening a file keeps its baseline — switching files must
 *  not erase progress. The badge shows the net sum of (latest − baseline)
 *  over every touched file, clamped at 0: deletions in one file offset
 *  additions in another. State advances only through explicit editor
 *  reports, never by observing render-time word-count state — baselining
 *  from renders raced the load path and made "+N" equal the document total.
 *  A "session" deliberately ends when Ovid quits; nothing is persisted. */
export function useSessionWords() {
  const baselinesRef = useRef(new Map<string, number>());
  const countsRef = useRef(new Map<string, number>());
  const [sessionWordsAdded, setSessionWordsAdded] = useState(0);

  const noteWordCount = useCallback((path: string, count: number) => {
    if (!baselinesRef.current.has(path)) baselinesRef.current.set(path, count);
    countsRef.current.set(path, count);
    let sum = 0;
    for (const [p, baseline] of baselinesRef.current) {
      sum += (countsRef.current.get(p) ?? baseline) - baseline;
    }
    setSessionWordsAdded(Math.max(0, sum));
  }, []);

  return { sessionWordsAdded, noteWordCount };
}
