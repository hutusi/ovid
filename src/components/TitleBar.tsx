import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isMac } from "../lib/platform";
import type { FileNode, SaveStatus } from "../lib/types";
import { TabBar } from "./TabBar";
import "./TitleBar.css";

interface TitleBarProps {
  tabs: string[];
  tree: FileNode[];
  activePath: string | null;
  saveStatus: SaveStatus;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
}

export function TitleBar({
  tabs,
  tree,
  activePath,
  saveStatus,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
}: TitleBarProps) {
  return (
    <div className="title-bar" data-tauri-drag-region>
      {isMac && <div className="title-bar-gutter" data-tauri-drag-region />}
      <TabBar
        tabs={tabs}
        tree={tree}
        activePath={activePath}
        saveStatus={saveStatus}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onReorder={onReorderTabs}
      />
      {!isMac && <WindowControls />}
    </div>
  );
}

function WindowControls() {
  const { t } = useTranslation();
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control"
        aria-label={t("window.minimize")}
        onClick={() => void getCurrentWindow().minimize()}
      >
        <Minus size={12} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={t("window.maximize")}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        <Square size={11} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label={t("window.close")}
        onClick={() => void getCurrentWindow().close()}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
