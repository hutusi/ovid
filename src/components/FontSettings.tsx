import { Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FontFamily, FontSize } from "../lib/useEditorPreferences";
import "./FontSettings.css";

interface FontSettingsProps {
  fontFamily: FontFamily;
  fontSize: FontSize;
  spellCheck: boolean;
  wordCountGoal: number | null;
  onSetFontFamily: (f: FontFamily) => void;
  onSetFontSize: (s: FontSize) => void;
  onToggleSpellCheck: () => void;
  onSetWordCountGoal: (n: number | null) => void;
}

export function FontSettingsButton({
  fontFamily,
  fontSize,
  spellCheck,
  wordCountGoal,
  onSetFontFamily,
  onSetFontSize,
  onToggleSpellCheck,
  onSetWordCountGoal,
}: FontSettingsProps) {
  const [open, setOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setGoalInput(wordCountGoal !== null ? String(wordCountGoal) : "");

    function handlePointerDown(e: PointerEvent) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, wordCountGoal]);

  function handleSetGoal() {
    const n = Number.parseInt(goalInput, 10);
    if (Number.isFinite(n) && n > 0) {
      onSetWordCountGoal(n);
    }
  }

  function handleClearGoal() {
    setGoalInput("");
    onSetWordCountGoal(null);
  }

  return (
    <div ref={anchorRef} className="fsp-anchor">
      <button
        type="button"
        className="statusbar-control statusbar-font-button"
        title="Editor settings (font, spell check, session goal)"
        aria-label="Editor settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Type className="statusbar-mode-icon" aria-hidden="true" />
      </button>

      {open && (
        <div className="fsp-panel" role="dialog" aria-label="Editor settings">
          <span className="fsp-section-label">Font</span>
          <div className="fsp-chip-row">
            {(["serif", "sans", "mono"] as FontFamily[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={fontFamily === f}
                aria-label={`${f === "serif" ? "Serif" : f === "sans" ? "Sans-serif" : "Monospace"} font`}
                className={`fsp-chip${fontFamily === f ? " fsp-chip--active" : ""}`}
                onClick={() => onSetFontFamily(f)}
              >
                {f === "serif" ? "Serif" : f === "sans" ? "Sans" : "Mono"}
              </button>
            ))}
          </div>

          <span className="fsp-section-label">Size</span>
          <div className="fsp-chip-row">
            {(["small", "default", "large"] as FontSize[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={fontSize === s}
                aria-label={`${s === "small" ? "Small" : s === "default" ? "Medium" : "Large"} font size`}
                className={`fsp-chip${fontSize === s ? " fsp-chip--active" : ""}`}
                onClick={() => onSetFontSize(s)}
              >
                {s === "small" ? "S" : s === "default" ? "M" : "L"}
              </button>
            ))}
          </div>

          <div className="fsp-divider" />

          <button
            type="button"
            aria-pressed={spellCheck}
            className="fsp-toggle"
            onClick={onToggleSpellCheck}
          >
            <span>Spell check</span>
            <span className={`fsp-toggle-value${spellCheck ? " fsp-toggle-value--on" : ""}`}>
              {spellCheck ? "on" : "off"}
            </span>
          </button>

          <div className="fsp-divider" />

          <label htmlFor="fsp-goal-input" className="fsp-section-label">
            Session goal
          </label>
          <div className="fsp-goal-row">
            <input
              id="fsp-goal-input"
              className="fsp-goal-input"
              type="number"
              min="1"
              placeholder="words"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetGoal();
              }}
            />
            <button type="button" className="fsp-goal-set" onClick={handleSetGoal}>
              Set
            </button>
            {wordCountGoal !== null && (
              <button type="button" className="fsp-goal-clear" onClick={handleClearGoal}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
