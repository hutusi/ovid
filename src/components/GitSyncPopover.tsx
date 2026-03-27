import { useEffect, useRef } from "react";
import type { GitSyncPopoverState } from "../lib/gitUi";

interface GitSyncPopoverProps {
  state: GitSyncPopoverState;
  onClose: () => void;
  onAction?: () => void;
}

export function GitSyncPopover({ state, onClose, onAction }: GitSyncPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="git-sync-popover" ref={popoverRef} role="dialog" aria-label="Git sync status">
      <div className="git-sync-popover-header">
        <span className="git-sync-popover-title">{state.title}</span>
        <button
          type="button"
          className="git-sync-popover-close"
          onClick={onClose}
          aria-label="Close sync status"
        >
          ×
        </button>
      </div>
      <div className="git-sync-popover-tracking">{state.tracking}</div>
      <p className="git-sync-popover-description">{state.description}</p>
      {state.actionLabel && onAction && (
        <button type="button" className="git-sync-popover-action" onClick={onAction}>
          {state.actionLabel}
        </button>
      )}
    </div>
  );
}
