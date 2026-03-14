import type { SaveStatus } from "../lib/types";
import type { ResolvedTheme } from "../lib/useTheme";
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
  onToggleTheme: () => void;
  onToggleZen: () => void;
  onToggleTypewriter: () => void;
}

export function StatusBar({
  fileName,
  wordCount,
  resolvedTheme,
  saveStatus,
  zenMode,
  typewriterMode,
  sessionWordsAdded,
  onToggleTheme,
  onToggleZen,
  onToggleTypewriter,
}: StatusBarProps) {
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
          <span className="statusbar-session" title="Words added this session">
            +{sessionWordsAdded}
          </span>
        )}
        <span className="statusbar-words">{wordCount > 0 ? `${wordCount} words` : ""}</span>
        <button
          type="button"
          className={`statusbar-mode-btn${typewriterMode ? " active" : ""}`}
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
          className={`statusbar-mode-btn${zenMode ? " active" : ""}`}
          onClick={onToggleZen}
          title={zenMode ? "Exit zen mode (Esc)" : "Enter zen mode (⌘⇧Z)"}
          aria-label="Toggle zen mode"
          aria-pressed={zenMode}
        >
          ◎
        </button>
        <button
          type="button"
          className="statusbar-theme-btn"
          onClick={onToggleTheme}
          title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? "☀" : "⏾"}
        </button>
      </div>
    </div>
  );
}
