import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FilePenLine,
  GitBranch,
  Keyboard,
  MoonStar,
  PencilLine,
  SunMedium,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildMenuLabels } from "../lib/menuLabels";
import type { SaveStatus } from "../lib/types";
import type { FontFamily, FontSize } from "../lib/useEditorPreferences";
import type { ResolvedTheme } from "../lib/useTheme";
import { FontSettingsButton } from "./FontSettings";
import "./StatusBar.css";

export type { SaveStatus };

function GitSyncStatusIcon({ label }: { label: string }) {
  if (label === "ahead") {
    return <ArrowUp className="statusbar-git-icon" aria-hidden="true" />;
  }
  if (label === "behind") {
    return <ArrowDown className="statusbar-git-icon" aria-hidden="true" />;
  }
  if (label === "diverged") {
    return <ArrowUpDown className="statusbar-git-icon" aria-hidden="true" />;
  }
  return null;
}

interface StatusBarProps {
  fileLabel: string | null;
  wordCount: number;
  resolvedTheme: ResolvedTheme;
  saveStatus: SaveStatus;
  zenMode: boolean;
  typewriterMode: boolean;
  sessionWordsAdded: number;
  wordCountGoal: number | null;
  fontFamily: FontFamily;
  fontSize: FontSize;
  spellCheck: boolean;
  gitBranch: string | null;
  gitBranchTitle?: string;
  gitSyncLabel?: string | null;
  gitSyncTitle?: string;
  gitChangeLabel?: string | null;
  gitChangeTitle?: string;
  gitSyncPopoverOpen?: boolean;
  onOpenBranches: () => void;
  onRenamePath?: () => void;
  onOpenCommit: () => void;
  onOpenGitSync: () => void;
  onToggleTheme: () => void;
  onToggleZen: () => void;
  onToggleTypewriter: () => void;
  onSetFontFamily: (f: FontFamily) => void;
  onSetFontSize: (s: FontSize) => void;
  onToggleSpellCheck: () => void;
  onSetWordCountGoal: (n: number | null) => void;
}

export function StatusBar({
  fileLabel,
  wordCount,
  resolvedTheme,
  saveStatus,
  zenMode,
  typewriterMode,
  sessionWordsAdded,
  wordCountGoal,
  fontFamily,
  fontSize,
  spellCheck,
  gitBranch,
  gitBranchTitle,
  gitSyncLabel,
  gitSyncTitle,
  gitChangeLabel,
  gitChangeTitle,
  gitSyncPopoverOpen = false,
  onOpenBranches,
  onRenamePath,
  onOpenCommit,
  onOpenGitSync,
  onToggleTheme,
  onToggleZen,
  onToggleTypewriter,
  onSetFontFamily,
  onSetFontSize,
  onToggleSpellCheck,
  onSetWordCountGoal,
}: StatusBarProps) {
  const { t, i18n } = useTranslation();
  const goalProgress =
    wordCountGoal !== null && wordCountGoal > 0 ? sessionWordsAdded / wordCountGoal : null;
  const sessionClass =
    goalProgress === null
      ? "statusbar-session"
      : goalProgress >= 1
        ? "statusbar-session goal-reached"
        : goalProgress >= 0.5
          ? "statusbar-session goal-halfway"
          : "statusbar-session";

  const sessionTitle =
    wordCountGoal !== null
      ? t("status_bar.session_goal", { added: sessionWordsAdded, goal: wordCountGoal })
      : t("status_bar.session_words_title");

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        {fileLabel && (
          <span
            className={`save-dot ${saveStatus}`}
            title={saveStatus === "unsaved" ? t("status_bar.unsaved") : t("status_bar.saved")}
          />
        )}
        {fileLabel ? (
          <button
            type="button"
            className="statusbar-file statusbar-file-button"
            onClick={onRenamePath}
            title={t("status_bar.rename_path")}
          >
            <FilePenLine className="statusbar-git-icon" aria-hidden="true" />
            {fileLabel}
          </button>
        ) : (
          <span className="statusbar-file">—</span>
        )}
        {gitBranch && (
          <div className="statusbar-git">
            <button
              type="button"
              className="statusbar-branch"
              onClick={onOpenBranches}
              title={gitBranchTitle ?? `Current branch: ${gitBranch}`}
            >
              <GitBranch className="statusbar-git-icon" aria-hidden="true" />
              {gitBranch}
            </button>
            {gitChangeLabel && (
              <button
                type="button"
                className="statusbar-git-changes"
                onClick={onOpenCommit}
                title={gitChangeTitle ?? gitChangeLabel}
              >
                <PencilLine className="statusbar-git-icon" aria-hidden="true" />
                {gitChangeLabel}
              </button>
            )}
            {gitSyncLabel && (
              <button
                type="button"
                className="statusbar-git-sync"
                onClick={onOpenGitSync}
                title={gitSyncTitle ?? gitSyncLabel}
                aria-haspopup="dialog"
                aria-expanded={gitSyncPopoverOpen}
              >
                <GitSyncStatusIcon label={gitSyncLabel} />
                {gitSyncLabel}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="statusbar-right">
        {sessionWordsAdded > 0 && (
          <span className={sessionClass} title={sessionTitle}>
            +{sessionWordsAdded}
            {wordCountGoal !== null && `/${wordCountGoal}`}
          </span>
        )}
        <span className="statusbar-words">
          {wordCount > 0 ? t("status_bar.word_count", { count: wordCount }) : ""}
        </span>
        <div className="statusbar-mode-group">
          <button
            type="button"
            className={`statusbar-control statusbar-mode-toggle statusbar-typewriter-toggle${typewriterMode ? " statusbar-control-active" : ""}`}
            onClick={onToggleTypewriter}
            title={
              typewriterMode
                ? t("status_bar.typewriter_disable")
                : t("status_bar.typewriter_enable")
            }
            aria-label={t("status_bar.typewriter_toggle")}
            aria-pressed={typewriterMode}
          >
            <Keyboard className="statusbar-mode-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`statusbar-control statusbar-mode-toggle${zenMode ? " statusbar-control-active" : ""}`}
            onClick={onToggleZen}
            title={zenMode ? t("status_bar.zen_exit") : t("status_bar.zen_enter")}
            aria-label={t("status_bar.zen_toggle")}
            aria-pressed={zenMode}
          >
            <span className="statusbar-zen-icon" aria-hidden="true" />
          </button>
        </div>
        <FontSettingsButton
          fontFamily={fontFamily}
          fontSize={fontSize}
          spellCheck={spellCheck}
          wordCountGoal={wordCountGoal}
          onSetFontFamily={onSetFontFamily}
          onSetFontSize={onSetFontSize}
          onToggleSpellCheck={onToggleSpellCheck}
          onSetWordCountGoal={onSetWordCountGoal}
        />
        <button
          type="button"
          className="statusbar-control statusbar-mode-toggle"
          onClick={onToggleTheme}
          title={
            resolvedTheme === "dark" ? t("status_bar.theme_light") : t("status_bar.theme_dark")
          }
          aria-label={t("status_bar.theme_toggle")}
          aria-pressed={resolvedTheme === "dark"}
        >
          {resolvedTheme === "dark" ? (
            <SunMedium className="statusbar-mode-icon" aria-hidden="true" />
          ) : (
            <MoonStar className="statusbar-mode-icon" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="statusbar-control statusbar-lang-toggle"
          onClick={() => {
            const next = i18n.language === "zh-CN" ? "en" : "zh-CN";
            void i18n.changeLanguage(next).then(() => {
              void invoke("set_menu_language", { labels: buildMenuLabels(i18n.t.bind(i18n)) });
            });
          }}
          title={t("status_bar.language")}
          aria-label={t("status_bar.language")}
        >
          {i18n.language === "zh-CN" ? "中" : "EN"}
        </button>
      </div>
    </div>
  );
}
