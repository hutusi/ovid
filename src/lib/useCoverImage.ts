import { useEffect, useState } from "react";
import type { FileNode } from "./types";

/** Cover-image visibility for the current file; hidden again on file switch. */
export function useCoverImage(selectedFile: FileNode | null) {
  const [coverImageVisible, setCoverImageVisible] = useState(false);

  // Reset when switching files (selectedFile is the trigger, not used in body)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile is the intended trigger
  useEffect(() => {
    setCoverImageVisible(false);
  }, [selectedFile]);

  const toggleCoverImage = () => setCoverImageVisible((v) => !v);

  return { coverImageVisible, toggleCoverImage };
}
