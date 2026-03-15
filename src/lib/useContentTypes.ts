import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { ContentType } from "./types";

export function useContentTypes(workspaceRoot: string | null, isAmytisWorkspace: boolean) {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);

  useEffect(() => {
    if (!workspaceRoot || !isAmytisWorkspace) {
      setContentTypes([]);
      return;
    }
    invoke<ContentType[]>("get_content_types")
      .then(setContentTypes)
      .catch(() => setContentTypes([]));
  }, [workspaceRoot, isAmytisWorkspace]);

  return contentTypes;
}
