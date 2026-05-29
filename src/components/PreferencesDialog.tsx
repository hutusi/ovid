import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContentFormat, ContentLayout } from "../lib/amytisScaffold";
import { commands } from "../lib/commands";
import { buildMenuLabels } from "../lib/menuLabels";
import type { AppPreferences } from "../lib/useAppPreferences";
import type { ContentPreferences } from "../lib/useContentPreferences";
import type { EditorPreferences, FontFamily, FontSize } from "../lib/useEditorPreferences";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { ThemePreference } from "../lib/useTheme";
import "./Modal.css";
import "./PreferencesDialog.css";

const TABS = ["general", "appearance", "editor", "language", "content"] as const;
type PrefTab = (typeof TABS)[number];

interface PreferencesDialogProps {
  themePreference: ThemePreference;
  onSetThemePreference: (p: ThemePreference) => void;
  editorPrefs: EditorPreferences;
  onUpdateEditorPrefs: (updates: Partial<EditorPreferences>) => void;
  wordCountGoal: number | null;
  onSetWordCountGoal: (n: number | null) => void;
  contentPrefs: ContentPreferences;
  onUpdateContentPrefs: (updates: Partial<ContentPreferences>) => void;
  appPrefs: AppPreferences;
  onUpdateAppPrefs: (updates: Partial<AppPreferences>) => void;
  onClose: () => void;
}

export function PreferencesDialog({
  themePreference,
  onSetThemePreference,
  editorPrefs,
  onUpdateEditorPrefs,
  wordCountGoal,
  onSetWordCountGoal,
  contentPrefs,
  onUpdateContentPrefs,
  appPrefs,
  onUpdateAppPrefs,
  onClose,
}: PreferencesDialogProps) {
  const { t, i18n } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const [activeTab, setActiveTab] = useState<PrefTab>("general");
  const tabRefs = useRef<Record<PrefTab, HTMLButtonElement | null>>({
    general: null,
    appearance: null,
    editor: null,
    language: null,
    content: null,
  });

  const [goalInput, setGoalInput] = useState(wordCountGoal !== null ? String(wordCountGoal) : "");
  useEffect(() => {
    setGoalInput(wordCountGoal !== null ? String(wordCountGoal) : "");
  }, [wordCountGoal]);

  const currentLanguage = i18n.language === "zh-CN" ? "zh-CN" : "en";

  function changeLanguage(lng: string) {
    void i18n.changeLanguage(lng).then(() => {
      void commands.menu.setLanguage({ labels: buildMenuLabels(i18n.t.bind(i18n)) });
    });
  }

  function commitGoal() {
    const trimmed = goalInput.trim();
    if (trimmed === "") {
      onSetWordCountGoal(null);
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    onSetWordCountGoal(Number.isFinite(n) && n > 0 ? n : null);
  }

  function handleTabKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.indexOf(activeTab);
    let next = idx;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const nextTab = TABS[next];
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
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
        aria-label={t("preferences.title")}
        className="modal-panel pref-panel"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="pref-body">
          <div
            className="pref-nav"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("preferences.title")}
            onKeyDown={handleTabKeyDown}
          >
            {TABS.map((tab) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el;
                }}
                type="button"
                role="tab"
                id={`pref-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`pref-panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                className={`pref-nav-tab${activeTab === tab ? " pref-nav-tab--active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {t(`preferences.tabs.${tab}`)}
              </button>
            ))}
          </div>

          <div
            className="pref-content"
            role="tabpanel"
            id={`pref-panel-${activeTab}`}
            aria-labelledby={`pref-tab-${activeTab}`}
          >
            <h2 className="pref-tab-title">{t(`preferences.tabs.${activeTab}`)}</h2>

            {activeTab === "general" && (
              <div className="pref-field">
                <label htmlFor="pref-restore-session" className="pref-field-label">
                  <span className="pref-field-name">
                    {t("preferences.general.restore_session")}
                  </span>
                  <span className="pref-field-hint">
                    {t("preferences.general.restore_session_hint")}
                  </span>
                </label>
                <input
                  id="pref-restore-session"
                  type="checkbox"
                  className="pref-checkbox"
                  checked={appPrefs.restoreLastSession}
                  onChange={(e) => onUpdateAppPrefs({ restoreLastSession: e.target.checked })}
                />
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="pref-field">
                <span className="pref-field-name">{t("preferences.appearance.theme")}</span>
                <select
                  className="pref-select"
                  aria-label={t("preferences.appearance.theme")}
                  value={themePreference}
                  onChange={(e) => onSetThemePreference(e.target.value as ThemePreference)}
                >
                  <option value="system">{t("preferences.appearance.theme_system")}</option>
                  <option value="light">{t("preferences.appearance.theme_light")}</option>
                  <option value="dark">{t("preferences.appearance.theme_dark")}</option>
                </select>
              </div>
            )}

            {activeTab === "editor" && (
              <>
                <div className="pref-field">
                  <span className="pref-field-name">{t("preferences.editor.font_family")}</span>
                  <select
                    className="pref-select"
                    aria-label={t("preferences.editor.font_family")}
                    value={editorPrefs.fontFamily}
                    onChange={(e) =>
                      onUpdateEditorPrefs({ fontFamily: e.target.value as FontFamily })
                    }
                  >
                    <option value="serif">{t("font_settings.font_serif")}</option>
                    <option value="sans">{t("font_settings.font_sans")}</option>
                    <option value="mono">{t("font_settings.font_mono")}</option>
                  </select>
                </div>
                <div className="pref-field">
                  <span className="pref-field-name">{t("preferences.editor.font_size")}</span>
                  <select
                    className="pref-select"
                    aria-label={t("preferences.editor.font_size")}
                    value={editorPrefs.fontSize}
                    onChange={(e) => onUpdateEditorPrefs({ fontSize: e.target.value as FontSize })}
                  >
                    <option value="small">{t("font_settings.size_small")}</option>
                    <option value="default">{t("font_settings.size_medium")}</option>
                    <option value="large">{t("font_settings.size_large")}</option>
                  </select>
                </div>
                <div className="pref-field">
                  <label htmlFor="pref-spellcheck" className="pref-field-name">
                    {t("font_settings.spell_check")}
                  </label>
                  <input
                    id="pref-spellcheck"
                    type="checkbox"
                    className="pref-checkbox"
                    checked={editorPrefs.spellCheck}
                    onChange={(e) => onUpdateEditorPrefs({ spellCheck: e.target.checked })}
                  />
                </div>
                <div className="pref-field">
                  <label htmlFor="pref-goal" className="pref-field-label">
                    <span className="pref-field-name">
                      {t("preferences.editor.word_count_goal")}
                    </span>
                    <span className="pref-field-hint">
                      {t("preferences.editor.word_count_goal_hint")}
                    </span>
                  </label>
                  <input
                    id="pref-goal"
                    type="number"
                    min="1"
                    className="modal-input pref-goal-input"
                    placeholder={t("font_settings.words_placeholder")}
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onBlur={commitGoal}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitGoal();
                    }}
                  />
                </div>
              </>
            )}

            {activeTab === "language" && (
              <div className="pref-field">
                <span className="pref-field-name">{t("preferences.language.app_language")}</span>
                <select
                  className="pref-select"
                  aria-label={t("preferences.language.app_language")}
                  value={currentLanguage}
                  onChange={(e) => changeLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                </select>
              </div>
            )}

            {activeTab === "content" && (
              <>
                <div className="pref-field">
                  <label htmlFor="pref-format" className="pref-field-label">
                    <span className="pref-field-name">{t("preferences.content.format")}</span>
                    <span className="pref-field-hint">{t("preferences.content.format_hint")}</span>
                  </label>
                  <select
                    id="pref-format"
                    className="pref-select"
                    value={contentPrefs.format}
                    onChange={(e) =>
                      onUpdateContentPrefs({ format: e.target.value as ContentFormat })
                    }
                  >
                    <option value="mdx">.mdx</option>
                    <option value="md">.md</option>
                  </select>
                </div>
                <div className="pref-field">
                  <label htmlFor="pref-layout" className="pref-field-label">
                    <span className="pref-field-name">{t("preferences.content.layout")}</span>
                    <span className="pref-field-hint">{t("preferences.content.layout_hint")}</span>
                  </label>
                  <select
                    id="pref-layout"
                    className="pref-select"
                    value={contentPrefs.layout}
                    onChange={(e) =>
                      onUpdateContentPrefs({ layout: e.target.value as ContentLayout })
                    }
                  >
                    <option value="file">{t("preferences.content.layout_file")}</option>
                    <option value="folder">{t("preferences.content.layout_folder")}</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pref-footer">
          <button type="button" className="modal-btn modal-btn-primary" onClick={onClose}>
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
