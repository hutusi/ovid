import { lazy, Suspense } from "react";
import { isPerfLoggingEnabled } from "../lib/perf";
import type { AppPreferences } from "../lib/useAppPreferences";
import type { ContentPreferences } from "../lib/useContentPreferences";
import type { EditorPreferences } from "../lib/useEditorPreferences";
import type { ConflictResolution } from "../lib/useFileEditor";
import type { OverlayStack } from "../lib/useOverlayStack";
import type { ThemePreference } from "../lib/useTheme";
import type { NotificationEntry, ShowToast } from "../lib/useToast";
import { ConflictDialog } from "./ConflictDialog";
import { FileDialogs, type FileDialogsProps } from "./dialogs/FileDialogs";
import { GitDialogs, type GitDialogsProps } from "./dialogs/GitDialogs";
import { WechatDialogs, type WechatDialogsProps } from "./dialogs/WechatDialogs";
import { WorkspaceDialogs, type WorkspaceDialogsProps } from "./dialogs/WorkspaceDialogs";

const NotificationsDialog = lazy(async () => ({
  default: (await import("./NotificationsDialog")).NotificationsDialog,
}));
const PerfPanel = lazy(async () => ({
  default: (await import("./PerfPanel")).PerfPanel,
}));
const UpdateDialog = lazy(async () => ({
  default: (await import("./UpdateDialog")).UpdateDialog,
}));
const ShortcutsHelpDialog = lazy(async () => ({
  default: (await import("./ShortcutsHelpDialog")).ShortcutsHelpDialog,
}));
const PreferencesDialog = lazy(async () => ({
  default: (await import("./PreferencesDialog")).PreferencesDialog,
}));

export interface PreferencesDialogGroupProps {
  themePreference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
  editorPrefs: EditorPreferences;
  updateEditorPrefs: (updates: Partial<EditorPreferences>) => void;
  wordCountGoal: number | null;
  setWordCountGoal: (n: number | null) => void;
  contentPrefs: ContentPreferences;
  updateContentPrefs: (updates: Partial<ContentPreferences>) => void;
  appPrefs: AppPreferences;
  updateAppPrefs: (updates: Partial<AppPreferences>) => void;
  showToast: ShowToast;
}

export interface AppDialogsProps {
  // Overlay stack — the single visibility seam for every dialog below.
  overlay: OverlayStack;

  notifications: NotificationEntry[];
  clearNotifications: () => void;

  // UpdateDialog
  flushPendingSave: () => Promise<void>;

  // Domain dialog groups — each group component derives its payloads from
  // the overlay state; these objects carry only the actions/data the
  // domain owns.
  git: Omit<GitDialogsProps, "overlay">;
  workspace: Omit<WorkspaceDialogsProps, "overlay">;
  files: Omit<FileDialogsProps, "overlay">;
  wechat: Omit<WechatDialogsProps, "overlay">;
  preferences: PreferencesDialogGroupProps;
  // External-change conflict prompt. Visibility is the `conflict` overlay.
  conflict: {
    fileName: string;
    resolveConflict: (resolution: ConflictResolution) => void;
  };
}

export function AppDialogs({
  overlay,
  notifications,
  clearNotifications,
  flushPendingSave,
  git,
  workspace,
  files,
  wechat,
  preferences,
  conflict,
}: AppDialogsProps) {
  return (
    <>
      <GitDialogs overlay={overlay} {...git} />
      {overlay.is("notifications") && (
        <Suspense fallback={null}>
          <NotificationsDialog
            notifications={notifications}
            onClear={clearNotifications}
            onClose={() => overlay.close("notifications")}
          />
        </Suspense>
      )}
      <WorkspaceDialogs overlay={overlay} {...workspace} />
      {overlay.is("update") && (
        <Suspense fallback={null}>
          <UpdateDialog
            onBeforeRestart={flushPendingSave}
            onClose={() => overlay.close("update")}
          />
        </Suspense>
      )}
      {overlay.is("shortcutsHelp") && (
        <Suspense fallback={null}>
          <ShortcutsHelpDialog onClose={() => overlay.close("shortcutsHelp")} />
        </Suspense>
      )}
      {overlay.is("preferences") && (
        <Suspense fallback={null}>
          <PreferencesDialog
            themePreference={preferences.themePreference}
            onSetThemePreference={preferences.setThemePreference}
            editorPrefs={preferences.editorPrefs}
            onUpdateEditorPrefs={preferences.updateEditorPrefs}
            wordCountGoal={preferences.wordCountGoal}
            onSetWordCountGoal={preferences.setWordCountGoal}
            contentPrefs={preferences.contentPrefs}
            onUpdateContentPrefs={preferences.updateContentPrefs}
            appPrefs={preferences.appPrefs}
            onUpdateAppPrefs={preferences.updateAppPrefs}
            showToast={preferences.showToast}
            onClose={() => overlay.close("preferences")}
          />
        </Suspense>
      )}
      <WechatDialogs overlay={overlay} {...wechat} />
      <FileDialogs overlay={overlay} {...files} />
      {overlay.active?.kind === "conflict" && (
        <ConflictDialog
          fileName={conflict.fileName}
          reason={overlay.active.reason}
          onResolve={(resolution) => {
            overlay.close("conflict");
            conflict.resolveConflict(resolution);
          }}
        />
      )}
      {isPerfLoggingEnabled() && (
        <Suspense fallback={null}>
          <PerfPanel />
        </Suspense>
      )}
    </>
  );
}
