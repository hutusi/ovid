import { useMemo, useState } from "react";
import type { FlatFile } from "../lib/fileSearch";
import { flattenTree, score } from "../lib/fileSearch";
import type { FileNode, RecentFile } from "../lib/types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Dialog, DialogContent } from "./ui/dialog";

interface FileSwitcherProps {
  tree: FileNode[];
  recentFiles: RecentFile[];
  onSelect: (node: FileNode) => void;
  onClose: () => void;
}

export function FileSwitcher({ tree, recentFiles, onSelect, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState("");

  const allFiles = useMemo(() => flattenTree(tree), [tree]);

  const filesByPath = useMemo(() => {
    const map = new Map<string, FlatFile>();
    for (const f of allFiles) map.set(f.node.path, f);
    return map;
  }, [allFiles]);

  const { recentResults, otherResults } = useMemo(() => {
    if (!query.trim()) {
      const recentFlat = recentFiles
        .map((r) => filesByPath.get(r.path))
        .filter((f): f is FlatFile => f !== undefined);
      const recentPaths = new Set(recentFlat.map((f) => f.node.path));
      const rest = allFiles
        .filter((f) => !recentPaths.has(f.node.path))
        .slice(0, 50 - recentFlat.length);
      return { recentResults: recentFlat, otherResults: rest };
    }
    const filtered = allFiles
      .map((f) => ({ file: f, s: score(f, query.trim()) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ file }) => file)
      .slice(0, 50);
    return { recentResults: [] as FlatFile[], otherResults: filtered };
  }, [allFiles, filesByPath, recentFiles, query]);

  function renderItem(f: FlatFile) {
    return (
      <CommandItem
        key={f.node.path}
        value={f.node.path}
        onSelect={() => onSelect(f.node)}
        className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
      >
        <span className="text-[13.5px] truncate w-full" style={{ opacity: f.node.draft ? 0.5 : 1 }}>
          {f.displayName}
        </span>
        <span className="text-[11px] text-muted-foreground truncate w-full">{f.relativePath}</span>
      </CommandItem>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="overflow-hidden p-0 top-[80px] translate-y-0 max-w-[480px] shadow-2xl"
        aria-label="Quick file switcher"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search files…"
            value={query}
            onValueChange={(v) => setQuery(v)}
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No files match</CommandEmpty>
            {query.trim() === "" ? (
              <>
                {recentResults.length > 0 && (
                  <CommandGroup heading="Recent">{recentResults.map(renderItem)}</CommandGroup>
                )}
                {recentResults.length > 0 && otherResults.length > 0 && <CommandSeparator />}
                {otherResults.length > 0 && (
                  <CommandGroup heading={recentResults.length > 0 ? "All files" : undefined}>
                    {otherResults.map(renderItem)}
                  </CommandGroup>
                )}
              </>
            ) : (
              <CommandGroup>{otherResults.map(renderItem)}</CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
