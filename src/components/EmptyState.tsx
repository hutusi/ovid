const isMac = navigator.platform.startsWith("Mac") || navigator.userAgent.includes("Mac");
const modKey = isMac ? "⌘" : "Ctrl+";

interface RecentFile {
  path: string;
  name: string;
  title?: string;
}

interface EmptyStateProps {
  workspaceOpen: boolean;
  recentFiles: RecentFile[];
  onOpenWorkspace: () => void;
  onOpenRecent: (path: string) => void;
}

export function EmptyState({
  workspaceOpen,
  recentFiles,
  onOpenWorkspace,
  onOpenRecent,
}: EmptyStateProps) {
  if (workspaceOpen) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-fg-subtle select-none">
        <p className="text-[13px]">Select a file to start writing</p>
        {recentFiles.length > 0 && (
          <div className="mt-4 text-center">
            <p className="text-[10.5px] uppercase tracking-[0.06em] mb-2">Recent</p>
            <ul className="list-none flex flex-col gap-0.5">
              {recentFiles.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className="text-[13px] text-fg-muted px-2.5 py-[3px] rounded transition-colors hover:bg-surface-hover hover:text-fg max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap"
                    onClick={() => onOpenRecent(f.path)}
                  >
                    {f.title || f.name.replace(/\.mdx?$/, "")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-fg-subtle select-none">
      <h2 className="font-[var(--font-editor)] text-[28px] font-normal text-fg-muted tracking-[0.02em]">
        Ovid
      </h2>
      <p className="text-[13px]">A writing space for Amytis content</p>
      <button
        type="button"
        className="mt-1 text-[13px] text-accent border border-accent rounded-md px-4 py-1.5 transition-colors hover:bg-accent-subtle"
        onClick={onOpenWorkspace}
      >
        Open workspace
      </button>
      <p className="text-[11px] opacity-60">{modKey}O to open a folder</p>
    </div>
  );
}
