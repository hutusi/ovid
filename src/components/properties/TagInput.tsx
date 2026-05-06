import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { METADATA_TEXT_INPUT_PROPS } from "./shared";

export function TagInput({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.replace(/,$/, "").trim();
    if (tag && !tags.includes(tag)) {
      onSave([...tags, tag]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onSave(tags.filter((t) => t !== tag));
  }

  return (
    <div className="tag-input-area" role="none" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag) => (
        <span key={tag} className="prop-tag">
          {tag}
          <button
            type="button"
            className="prop-tag-remove"
            aria-label={t("properties.remove_tag", { tag })}
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        aria-label={t("properties.add_tag")}
        className="tag-input"
        {...METADATA_TEXT_INPUT_PROPS}
        value={input}
        placeholder={tags.length === 0 ? t("properties.add_tag_placeholder") : ""}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(input);
          } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
      />
    </div>
  );
}
