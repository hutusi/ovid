import type { ResolvedTheme } from "../lib/useTheme";

interface StatusBarProps {
  fileName: string | null;
  wordCount: number;
  resolvedTheme: ResolvedTheme;
  onToggleTheme: () => void;
}

export function StatusBar({ fileName, wordCount, resolvedTheme, onToggleTheme }: StatusBarProps) {
  return (
    <div className="statusbar">
      <span className="statusbar-file">{fileName ?? "—"}</span>
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
