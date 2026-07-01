import { useCallback, useMemo, useState } from "react";
import type { ModalState } from "./types";
import type {
  BranchSwitcherState,
  DeleteBranchDialogState,
  RenameBranchDialogState,
} from "./useGitBranchActions";
import type { CommitDialogState } from "./useGitCommitFlow";
import type { GitCredentialsDialogState } from "./useGitCredentialsRetry";

// One source of truth for "what overlay is on top of the editor right now."
// Replaces the 12+ independent visibility flags that were previously spread
// across App.tsx and useGitUiController, with the rule "only one overlay
// can be active at a time" enforced by the type instead of by convention.
export type Overlay =
  | { kind: "modal"; state: NonNullable<ModalState> }
  | { kind: "switcher" }
  | { kind: "workspaceSwitcher" }
  | { kind: "search" }
  | { kind: "update" }
  | { kind: "wechatPublish" }
  | { kind: "shortcutsHelp" }
  | { kind: "preferences" }
  | { kind: "commit"; state: NonNullable<CommitDialogState> }
  | { kind: "branchSwitcher"; state: NonNullable<BranchSwitcherState> }
  | { kind: "newBranch" }
  | { kind: "renameBranch"; state: NonNullable<RenameBranchDialogState> }
  | { kind: "deleteBranch"; state: NonNullable<DeleteBranchDialogState> }
  | { kind: "gitCredentials"; state: NonNullable<GitCredentialsDialogState> }
  | { kind: "gitSyncPopover" }
  | { kind: "notifications" };

export type OverlayKind = Overlay["kind"];

// gitSyncPopover and notifications are transient popovers anchored to the
// status bar, not modal dialogs — they don't suppress keyboard shortcuts
// or menu actions. Everything else is blocking.
const NON_BLOCKING_KINDS: ReadonlySet<OverlayKind> = new Set<OverlayKind>([
  "gitSyncPopover",
  "notifications",
]);

export function isOverlayBlocking(overlay: Overlay | null): boolean {
  if (overlay === null) return false;
  return !NON_BLOCKING_KINDS.has(overlay.kind);
}

export interface OverlayStack {
  active: Overlay | null;
  is: (kind: OverlayKind) => boolean;
  open: (overlay: Overlay) => void;
  close: (kind?: OverlayKind) => void;
  isBlocking: boolean;
}

export function useOverlayStack(): OverlayStack {
  const [active, setActive] = useState<Overlay | null>(null);

  const open = useCallback((overlay: Overlay) => {
    setActive(overlay);
  }, []);

  const close = useCallback((kind?: OverlayKind) => {
    setActive((prev) => {
      if (prev === null) return prev;
      if (kind !== undefined && prev.kind !== kind) return prev;
      return null;
    });
  }, []);

  const is = useCallback((kind: OverlayKind) => active?.kind === kind, [active]);

  return useMemo<OverlayStack>(
    () => ({ active, is, open, close, isBlocking: isOverlayBlocking(active) }),
    [active, is, open, close]
  );
}
