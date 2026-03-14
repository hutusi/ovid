import type { SaveStatus } from "../lib/types";
import type { ResolvedTheme } from "../lib/useTheme";
import "./StatusBar.css";

export type { SaveStatus };

interface StatusBarProps {
  fileName: string | null;
  wordCount: number;
  resolvedTheme: ResolvedTheme;
  saveStatus: SaveStatus;
  onToggleTheme: () => void;
}

export function StatusBar({
  fileName,
  wordCount,
  resolvedTheme,
  saveStatus,
  onToggleTheme,
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
        <span className="statusbar-words">{wordCount > 0 ? `${wordCount} words` : ""}</span>
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
