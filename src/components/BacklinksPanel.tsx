// BacklinksPanel: a collapsible "Linked references" section the editor
// renders at the bottom of its scroll area. Scans the workspace on mount
// (and whenever its inputs change), shows nothing when there are zero
// inbound links so the editor stays uncluttered when there's nothing to
// surface.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Backlink, findBacklinks } from "../lib/backlinks";
import { corpusReadFile, readCorpus } from "../lib/corpusCache";
import type { FlatFile } from "../lib/fileSearch";
import type { NoteResolverIndex } from "../lib/wikiLink";

interface BacklinksPanelProps {
  /** Workspace-relative path of the file currently displayed in the editor. */
  currentRelativePath: string | null;
  flatFiles: FlatFile[];
  resolverIndex: NoteResolverIndex;
  onOpenSource: (sourcePath: string) => void;
}

export function BacklinksPanel({
  currentRelativePath,
  flatFiles,
  resolverIndex,
  onOpenSource,
}: BacklinksPanelProps) {
  const { t } = useTranslation();
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentRelativePath) {
      setBacklinks(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      // The corpus cache serves the whole scan from one bulk read per tree
      // generation — switching files re-scans in memory with zero IPC.
      const contents = await readCorpus(flatFiles).catch(() => new Map<string, string>());
      if (cancelled) return;
      const result = await findBacklinks(currentRelativePath, {
        flatFiles,
        resolverIndex,
        excludeRelativePath: currentRelativePath,
        readFile: corpusReadFile(contents),
      });
      if (cancelled) return;
      setBacklinks(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentRelativePath, flatFiles, resolverIndex]);

  if (!currentRelativePath) return null;
  if (loading && backlinks === null) return null;
  if (!backlinks || backlinks.length === 0) return null;

  return (
    <aside className="backlinks-panel" aria-label={t("backlinks.title")}>
      <h2 className="backlinks-title">
        {t("backlinks.title_with_count", { count: backlinks.length })}
      </h2>
      <ul className="backlinks-list">
        {backlinks.map((bl) => (
          <li key={`${bl.sourcePath}:${bl.lineNumber}`}>
            <button
              type="button"
              className="backlinks-item"
              onClick={() => onOpenSource(bl.sourcePath)}
              aria-label={t("backlinks.openLine", {
                path: bl.sourceRelativePath,
                line: bl.lineNumber,
              })}
            >
              <span className="backlinks-item-title">{bl.sourceTitle}</span>
              <span className="backlinks-item-path">{bl.sourceRelativePath}</span>
              <span className="backlinks-item-snippet">{bl.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
