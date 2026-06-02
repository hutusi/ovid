import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isMac } from "../lib/platform";
import "./TitleBar.css";

export function TitleBar() {
  return (
    <div className="title-bar" data-tauri-drag-region>
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
        <Minus size={11} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={t("window.maximize")}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        <Square size={10} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label={t("window.close")}
        onClick={() => void getCurrentWindow().close()}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
