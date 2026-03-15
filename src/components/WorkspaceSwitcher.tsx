import type { RecentWorkspace } from "../lib/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface WorkspaceSwitcherProps {
  recentWorkspaces: RecentWorkspace[];
  currentRootPath: string | null;
  onSelect: (rootPath: string) => void;
  onOpenOther: () => void;
  onClose: () => void;
}

export function WorkspaceSwitcher({
  recentWorkspaces,
  currentRootPath,
  onSelect,
  onOpenOther,
  onClose,
}: WorkspaceSwitcherProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[380px] max-w-[calc(100vw-48px)]">
        <DialogHeader>
          <DialogTitle>Workspaces</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto -mx-1">
          {recentWorkspaces.map((w) => (
            <button
              key={w.rootPath}
              type="button"
              className={`flex flex-col items-start w-full px-2.5 py-2 rounded-md text-left cursor-pointer transition-colors relative gap-0.5 ${
                w.rootPath === currentRootPath ? "bg-secondary" : "hover:bg-accent"
              }`}
              onClick={() => {
                if (w.rootPath !== currentRootPath) onSelect(w.rootPath);
                onClose();
              }}
            >
              <span
                className={`text-[13px] font-medium ${
                  w.rootPath === currentRootPath ? "text-primary" : "text-foreground"
                }`}
              >
                {w.name}
              </span>
              <span className="text-[11px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                {w.rootPath}
              </span>
              {w.rootPath === currentRootPath && (
                <span className="absolute top-2 right-2.5 text-[10px] text-primary opacity-70">
                  current
                </span>
              )}
            </button>
          ))}
          {recentWorkspaces.length === 0 && (
            <p className="text-[13px] text-muted-foreground px-2.5 py-3 text-center">
              No recent workspaces.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenOther();
              onClose();
            }}
            className="border-primary text-primary hover:bg-primary/10"
          >
            Open folder…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
