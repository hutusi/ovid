import { useCallback, useEffect, useRef, useState } from "react";
import { corpusReadFile, readCorpus } from "./corpusCache";
import type { FlatFile } from "./fileSearch";
import {
  buildNoteResolverIndex,
  EMPTY_NOTE_RESOLVER_INDEX,
  type NoteResolverIndex,
  type ResolvedWikiTarget,
  resolveWikiTarget,
} from "./wikiLink";

/** Longest a corpus read waits for the app to go idle. */
const IDLE_TIMEOUT_MS = 1500;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Run `task` once the main thread is idle (or after a short timeout where
 *  `requestIdleCallback` is unavailable); returns a cancel function. */
export function whenIdle(task: () => void): () => void {
  const win = window as IdleWindow;
  if (win.requestIdleCallback && win.cancelIdleCallback) {
    const handle = win.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => win.cancelIdleCallback?.(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
}

/** The wiki-link resolver index for the workspace's notes.
 *
 *  Building it reads every Markdown file (one bulk IPC read, shared with the
 *  backlinks scanner through the corpus cache) and parses each note's
 *  frontmatter. That work is deferred until the app is idle, so on opening a
 *  workspace it doesn't compete with the tree, the first file read and the
 *  editor's first render; links resolve a moment later instead. It reruns
 *  whenever the tree changes (and only then — an unchanged tree keeps its
 *  identity, see sameTree). */
export function useNoteIndex(flatFiles: FlatFile[]) {
  const [noteResolverIndex, setNoteResolverIndex] =
    useState<NoteResolverIndex>(EMPTY_NOTE_RESOLVER_INDEX);
  const noteResolverIndexRef = useRef(noteResolverIndex);
  noteResolverIndexRef.current = noteResolverIndex;

  useEffect(() => {
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void (async () => {
        const contents = await readCorpus(flatFiles).catch(() => new Map<string, string>());
        if (cancelled) return;
        const index = await buildNoteResolverIndex(flatFiles, corpusReadFile(contents));
        if (!cancelled) setNoteResolverIndex(index);
      })();
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [flatFiles]);

  /** Stable: resolves against the latest index at call time. */
  const resolve = useCallback(
    (target: string): ResolvedWikiTarget => resolveWikiTarget(target, noteResolverIndexRef.current),
    []
  );

  return { noteResolverIndex, resolveWikiTarget: resolve };
}
