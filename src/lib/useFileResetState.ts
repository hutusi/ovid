import { useEffect, useState } from "react";
import type { FileNode } from "./types";

/** Owns the small bundle of per-file UI state that resets together when the
 *  selected file changes: the session word-count baseline (for the "+N words
 *  this session" indicator) and cover-image visibility. Extracted from
 *  App.tsx so the reset-on-file-switch orchestration lives in one place
 *  instead of two inline effects. */
export function useFileResetState(selectedFile: FileNode | null, wordCount: number) {
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [baselineCaptured, setBaselineCaptured] = useState(false);
  const [coverImageVisible, setCoverImageVisible] = useState(false);

  // Reset per-file UI state when switching files (selectedFile is the trigger, not used in body)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile is the intended trigger
  useEffect(() => {
    setSessionBaseline(null);
    setBaselineCaptured(false);
    setCoverImageVisible(false);
  }, [selectedFile]);

  // Capture baseline on first word-count event for the new file (including empty files)
  useEffect(() => {
    if (!baselineCaptured) {
      setSessionBaseline(wordCount);
      setBaselineCaptured(true);
    }
  }, [wordCount, baselineCaptured]);

  const sessionWordsAdded = sessionBaseline !== null ? Math.max(0, wordCount - sessionBaseline) : 0;

  const toggleCoverImage = () => setCoverImageVisible((v) => !v);

  return {
    sessionWordsAdded,
    coverImageVisible,
    toggleCoverImage,
  };
}
