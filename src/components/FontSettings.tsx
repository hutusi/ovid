import { useState } from "react";
import type { FontFamily, FontSize } from "../lib/useEditorPreferences";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Separator } from "./ui/separator";

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
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) setGoalInput(wordCountGoal !== null ? String(wordCountGoal) : "");
        setOpen(isOpen);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="statusbar-theme-btn"
          title="Editor settings (font, spell check, session goal)"
          aria-label="Editor settings"
        >
          Aa
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[188px] p-2.5 flex flex-col gap-1.5"
        side="top"
        align="end"
        sideOffset={6}
      >
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.06em] px-0.5">
          Font
        </span>
        <div className="flex gap-1">
          {(["serif", "sans", "mono"] as FontFamily[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={fontFamily === f}
              aria-label={`${f === "serif" ? "Serif" : f === "sans" ? "Sans-serif" : "Monospace"} font`}
              className={`flex-1 px-1.5 py-1 rounded text-[11.5px] transition-colors cursor-pointer ${
                fontFamily === f
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              onClick={() => onSetFontFamily(f)}
            >
              {f === "serif" ? "Serif" : f === "sans" ? "Sans" : "Mono"}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.06em] px-0.5">
          Size
        </span>
        <div className="flex gap-1">
          {(["small", "default", "large"] as FontSize[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={fontSize === s}
              aria-label={`${s === "small" ? "Small" : s === "default" ? "Medium" : "Large"} font size`}
              className={`flex-1 px-1.5 py-1 rounded text-[11.5px] transition-colors cursor-pointer ${
                fontSize === s
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              onClick={() => onSetFontSize(s)}
            >
              {s === "small" ? "S" : s === "default" ? "M" : "L"}
            </button>
          ))}
        </div>

        <Separator className="my-0.5" />

        <button
          type="button"
          className="flex items-center justify-between px-1.5 py-1 rounded text-[11.5px] w-full cursor-pointer transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onToggleSpellCheck}
        >
          <span>Spell check</span>
          <span className={`text-[10.5px] shrink-0 ${spellCheck ? "text-primary" : ""}`}>
            {spellCheck ? "on" : "off"}
          </span>
        </button>

        <Separator className="my-0.5" />

        <label
          htmlFor="session-goal-input"
          className="text-[10px] text-muted-foreground uppercase tracking-[0.06em] px-0.5"
        >
          Session goal
        </label>
        <div className="flex gap-1 items-center">
          <input
            id="session-goal-input"
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] font-[var(--font-ui)] text-foreground bg-background border border-input rounded outline-none focus:border-ring transition-colors"
            type="number"
            min="1"
            placeholder="words"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetGoal();
            }}
          />
          <button
            type="button"
            className="shrink-0 px-1.5 py-0.5 text-[11px] text-primary border border-primary rounded cursor-pointer transition-colors hover:bg-primary/10"
            onClick={handleSetGoal}
          >
            Set
          </button>
          {wordCountGoal !== null && (
            <button
              type="button"
              className="shrink-0 px-1.5 py-0.5 text-[11px] text-muted-foreground border border-input rounded cursor-pointer transition-colors hover:bg-accent"
              onClick={handleClearGoal}
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
