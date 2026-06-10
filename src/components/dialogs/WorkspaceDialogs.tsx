import { lazy, Suspense } from "react";
import type { RecentWorkspace } from "../../lib/types";
import type { OverlayStack } from "../../lib/useOverlayStack";

const WorkspaceSwitcher = lazy(async () => ({
  default: (await import("../WorkspaceSwitcher")).WorkspaceSwitcher,
}));

export interface WorkspaceDialogsProps {
  overlay: OverlayStack;
  recentWorkspaces: RecentWorkspace[];
  workspaceRootPath: string | null;
  openWorkspaceAtPath: (path: string) => Promise<void>;
  handleOpenWorkspace: () => void;
  removeRecentWorkspace: (rootPath: string) => void;
  handleCreateAmytisWorkspace: (parentDir: string, name: string) => Promise<boolean>;
  handleCloneWorkspace: (url: string, parentDir: string, name: string | null) => Promise<boolean>;
  showToast: (message: string) => void;
}

/** The workspace manager overlay (open / create / clone / recents). */
export function WorkspaceDialogs({
  overlay,
  recentWorkspaces,
  workspaceRootPath,
  openWorkspaceAtPath,
  handleOpenWorkspace,
  removeRecentWorkspace,
  handleCreateAmytisWorkspace,
  handleCloneWorkspace,
  showToast,
}: WorkspaceDialogsProps) {
  if (!overlay.is("workspaceSwitcher")) return null;
  return (
    <Suspense fallback={null}>
      <WorkspaceSwitcher
        recentWorkspaces={recentWorkspaces}
        currentRootPath={workspaceRootPath}
        onSelect={(rootPath) => void openWorkspaceAtPath(rootPath)}
        onOpenOther={handleOpenWorkspace}
        onRemoveRecent={removeRecentWorkspace}
        onCreate={handleCreateAmytisWorkspace}
        onClone={handleCloneWorkspace}
        onToast={showToast}
        onClose={() => overlay.close("workspaceSwitcher")}
      />
    </Suspense>
  );
}
