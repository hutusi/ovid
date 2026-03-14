interface StatusBarProps {
  fileName: string | null;
  wordCount: number;
}

export function StatusBar({ fileName, wordCount }: StatusBarProps) {
  return (
    <div className="statusbar">
      <span className="statusbar-file">{fileName ?? "—"}</span>
      <span className="statusbar-words">
        {wordCount > 0 ? `${wordCount} words` : ""}
      </span>
    </div>
  );
}
