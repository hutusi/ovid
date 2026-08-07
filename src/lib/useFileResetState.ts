import { useCallback, useEffect, useState } from "react";
import type { FileNode } from "./types";

/** Owns the small bundle of per-file UI state that resets together when the
 *  selected file changes: the session word-count baseline (for the "+N words
 *  this session" indicator) and cover-image visibility.
 *
 *  The baseline is captured explicitly via `captureSessionBaseline`, wired to
 *  the editor's synchronous initial-count emission (`onInitialWordCount`).
 *  Snapshotting `wordCount` on file switch instead is a render race: the
 *  reset effect fires while `wordCount` still holds the load-time 0 and the
 *  real total only arrives via the debounced typing path, which made "+N"
 *  always equal the document total. The baseline is deliberately NOT cleared
 *  on file switch — the editor remounts per file and re-emits, and a
 *  parent-effect reset would clobber the child's same-commit capture. */
export function useFileResetState(selectedFile: FileNode | null, wordCount: number) {
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [coverImageVisible, setCoverImageVisible] = useState(false);

  // Reset per-file UI state when switching files (selectedFile is the trigger, not used in body)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile is the intended trigger
  useEffect(() => {
    setCoverImageVisible(false);
  }, [selectedFile]);

  const captureSessionBaseline = useCallback((count: number) => {
    setSessionBaseline(count);
  }, []);

  const sessionWordsAdded = sessionBaseline !== null ? Math.max(0, wordCount - sessionBaseline) : 0;

  const toggleCoverImage = () => setCoverImageVisible((v) => !v);

  return {
    sessionWordsAdded,
    captureSessionBaseline,
    coverImageVisible,
    toggleCoverImage,
  };
}
