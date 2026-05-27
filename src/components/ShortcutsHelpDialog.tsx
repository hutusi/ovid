import { useTranslation } from "react-i18next";
import {
  type ShortcutCategory,
  type ShortcutEntry,
  type ShortcutKeys,
  shortcutsByCategory,
} from "../lib/shortcuts";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./ShortcutsHelpDialog.css";

interface ShortcutsHelpDialogProps {
  onClose: () => void;
}

const CATEGORY_ORDER: ShortcutCategory[] = [
  "navigation",
  "files",
  "editing",
  "format",
  "view",
  "git",
  "help",
];

/** Render `{mod: true, shift: true, alt: true, key: "i"}` as `⌘⌥⇧I` (mac)
 *  or `Ctrl+Alt+Shift+I` (other). Detection is best-effort via navigator
 *  platform; the dialog labels each key with the local-conventional symbol. */
function formatKeys(keys: ShortcutKeys, isMac: boolean): string {
  const parts: string[] = [];
  if (keys.ctrl) parts.push(isMac ? "⌃" : "Ctrl");
  if (keys.alt) parts.push(isMac ? "⌥" : "Alt");
  if (keys.shift) parts.push(isMac ? "⇧" : "Shift");
  if (keys.mod) parts.push(isMac ? "⌘" : "Ctrl");
  // Special-case named keys so they render readably.
  const namedKeys: Record<string, string> = {
    Tab: "Tab",
    Escape: "Esc",
    Enter: "Enter",
    " ": "Space",
  };
  const k = namedKeys[keys.key] ?? keys.key;
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return isMac ? parts.join("") : parts.join("+");
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function ShortcutsHelpDialog({ onClose }: ShortcutsHelpDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const isMac = isMacPlatform();
  const grouped = shortcutsByCategory();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  function renderRow(s: ShortcutEntry) {
    return (
      <div key={s.id} className="shortcuts-row">
        <span className="shortcuts-description">
          {t(`shortcuts.${s.descriptionKey}`)}
          {s.note && <span className="shortcuts-note"> ({t(`shortcuts.note.${s.note}`)})</span>}
        </span>
        <kbd className="shortcuts-keys">{formatKeys(s.keys, isMac)}</kbd>
      </div>
    );
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("shortcuts_help.title")}
        className="modal-panel shortcuts-panel"
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("shortcuts_help.title")}</p>
        <p className="shortcuts-subtitle">{t("shortcuts_help.subtitle")}</p>

        <div className="shortcuts-groups">
          {CATEGORY_ORDER.map((category) => {
            const entries = grouped[category];
            if (entries.length === 0) return null;
            return (
              <section
                key={category}
                className="shortcuts-group"
                aria-labelledby={`sc-${category}`}
              >
                <h3 id={`sc-${category}`} className="shortcuts-group-title">
                  {t(`shortcuts.category.${category}`)}
                </h3>
                <div className="shortcuts-group-rows">{entries.map(renderRow)}</div>
              </section>
            );
          })}
        </div>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
