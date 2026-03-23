import type { SaveStatus } from "../lib/types";
import type { FontFamily, FontSize } from "../lib/useEditorPreferences";
import type { ResolvedTheme } from "../lib/useTheme";
import { FontSettingsButton } from "./FontSettings";
import "./StatusBar.css";

export type { SaveStatus };

interface StatusBarProps {
  fileName: string | null;
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
  onOpenBranches: () => void;
  onToggleTheme: () => void;
  onToggleZen: () => void;
  onToggleTypewriter: () => void;
  onSetFontFamily: (f: FontFamily) => void;
  onSetFontSize: (s: FontSize) => void;
  onToggleSpellCheck: () => void;
  onSetWordCountGoal: (n: number | null) => void;
}

export function StatusBar({
  fileName,
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
  onOpenBranches,
  onToggleTheme,
  onToggleZen,
  onToggleTypewriter,
  onSetFontFamily,
  onSetFontSize,
  onToggleSpellCheck,
  onSetWordCountGoal,
}: StatusBarProps) {
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
      ? `${sessionWordsAdded} / ${wordCountGoal} words (session goal)`
      : "Words added this session";

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        {fileName && (
          <span
            className={`save-dot ${saveStatus}`}
            title={saveStatus === "unsaved" ? "Unsaved changes" : "Saved"}
          />
        )}
        <span className="statusbar-file">{fileName ?? "—"}</span>
      </div>
      <div className="statusbar-right">
        {sessionWordsAdded > 0 && (
          <span className={sessionClass} title={sessionTitle}>
            +{sessionWordsAdded}
            {wordCountGoal !== null && `/${wordCountGoal}`}
          </span>
        )}
        <span className="statusbar-words">{wordCount > 0 ? `${wordCount} words` : ""}</span>
        {gitBranch && (
          <button
            type="button"
            className="statusbar-branch"
            onClick={onOpenBranches}
            title={gitBranchTitle ?? `Current branch: ${gitBranch}`}
          >
            {gitBranch}
          </button>
        )}
        <button
          type="button"
          className={`text-[13px] leading-none px-1 py-0.5 rounded transition-colors shrink-0 ${typewriterMode ? "text-accent opacity-100" : "text-fg-subtle opacity-60 hover:text-fg hover:bg-surface-hover hover:opacity-100"}`}
          onClick={onToggleTypewriter}
          title={
            typewriterMode
              ? "Disable typewriter mode"
              : "Enable typewriter mode (keeps cursor centered)"
          }
          aria-label="Toggle typewriter mode"
          aria-pressed={typewriterMode}
        >
          ⌨
        </button>
        <button
          type="button"
          className={`text-[13px] leading-none px-1 py-0.5 rounded transition-colors shrink-0 ${zenMode ? "text-accent opacity-100" : "text-fg-subtle opacity-60 hover:text-fg hover:bg-surface-hover hover:opacity-100"}`}
          onClick={onToggleZen}
          title={zenMode ? "Exit zen mode (Esc)" : "Enter zen mode (⌃⌘Z)"}
          aria-label="Toggle zen mode"
          aria-pressed={zenMode}
        >
          ◎
        </button>
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
          className="text-[13px] leading-none px-1 py-0.5 rounded opacity-60 transition-colors shrink-0 text-fg-subtle hover:text-accent hover:bg-accent-subtle hover:opacity-100"
          onClick={onToggleTheme}
          title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
          aria-pressed={resolvedTheme === "dark"}
        >
          {resolvedTheme === "dark" ? "☀" : "⏾"}
        </button>
      </div>
    </div>
  );
}
