import { useCallback, useEffect, useRef, useState } from "react";
import { corpusReadFile, onCorpusEdit, readCorpus } from "./corpusCache";
import type { FlatFile } from "./fileSearch";
import { parseFrontmatter } from "./frontmatter";
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

/** Read the corpus (shared with the backlinks scanner through the cache) and
 *  index each note's title and aliases. */
async function buildIndex(flatFiles: FlatFile[]): Promise<NoteResolverIndex> {
  const contents = await readCorpus(flatFiles).catch(() => new Map<string, string>());
  return buildNoteResolverIndex(flatFiles, corpusReadFile(contents));
}

type BuiltIndex = { workspace: string | null; index: NoteResolverIndex };

/** The wiki-link resolver index for the workspace's notes.
 *
 *  Building it reads every Markdown file (one bulk IPC read, shared with the
 *  backlinks scanner through the corpus cache) and parses each note's
 *  frontmatter. That work is deferred until the app is idle, so on opening a
 *  workspace it doesn't compete with the tree, the first file read and the
 *  editor's first render; links resolve a moment later instead. It reruns
 *  whenever `flatFiles` is renewed — after every workspace walk, since a walk
 *  that kept the tree may still have found an alias edited on disk — and when
 *  one of Ovid's own saves changes a file's frontmatter, where titles and
 *  aliases live. Those saves cause no walk; the corpus cache applies them in
 *  memory, so that rebuild reads nothing from disk.
 *
 *  The index belongs to the workspace it was built for. Until the open
 *  workspace's own index lands, resolution sees an empty one — never another
 *  workspace's, whose paths would be joined to this workspace's root. Within
 *  a workspace the previous index stays in use while a walk's rebuild runs. */
export function useNoteIndex(flatFiles: FlatFile[], workspace: string | null) {
  const [built, setBuilt] = useState<BuiltIndex>({
    workspace: null,
    index: EMPTY_NOTE_RESOLVER_INDEX,
  });
  const builtRef = useRef(built);
  builtRef.current = built;
  const flatFilesRef = useRef(flatFiles);
  flatFilesRef.current = flatFiles;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // Counts saves of Ovid's own that changed some file's frontmatter. A body
  // edit can't move a title or alias, so typing never rebuilds the index.
  const [frontmatterEdits, setFrontmatterEdits] = useState(0);

  useEffect(
    () =>
      onCorpusEdit((_path, before, after) => {
        if (parseFrontmatter(before).frontmatter !== parseFrontmatter(after).frontmatter) {
          setFrontmatterEdits((n) => n + 1);
        }
      }),
    []
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: frontmatterEdits reruns the build after a save changed a title or alias
  useEffect(() => {
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void buildIndex(flatFiles).then((index) => {
        if (!cancelled) setBuilt({ workspace, index });
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [flatFiles, workspace, frontmatterEdits]);

  const noteResolverIndex = built.workspace === workspace ? built.index : EMPTY_NOTE_RESOLVER_INDEX;

  /** Stable: resolves against the latest index at call time. */
  const resolve = useCallback((target: string): ResolvedWikiTarget => {
    const current = builtRef.current;
    return resolveWikiTarget(
      target,
      current.workspace === workspaceRef.current ? current.index : EMPTY_NOTE_RESOLVER_INDEX
    );
  }, []);

  /** Resolve a link the user is following. Before the open workspace's index
   *  has landed, every link would read as missing — and following one creates
   *  its note, a duplicate of the real one — so the index is built now instead
   *  of waiting for idle (the corpus read is shared with that build). */
  const resolveForNavigation = useCallback(async (target: string) => {
    const current = builtRef.current;
    if (current.workspace === workspaceRef.current) {
      return resolveWikiTarget(target, current.index);
    }
    const workspace = workspaceRef.current;
    const index = await buildIndex(flatFilesRef.current);
    if (workspaceRef.current === workspace && builtRef.current.workspace !== workspace) {
      setBuilt({ workspace, index });
    }
    return resolveWikiTarget(target, index);
  }, []);

  return {
    noteResolverIndex,
    resolveWikiTarget: resolve,
    resolveWikiTargetForNavigation: resolveForNavigation,
  };
}
