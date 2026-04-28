import { useEffect, useRef, useState } from "react";
import "./TitleInput.css";

interface TitleInputProps {
  title: string;
  onChange: (value: string) => void;
}

export function TitleInput({ title, onChange }: TitleInputProps) {
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(title);
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value.replace(/\n/g, "");
    setValue(next);
    resize();
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  }

  return (
    <div className="title-input-wrap">
      <textarea
        ref={ref}
        className="title-input"
        aria-label="Document title"
        placeholder="Untitled"
        rows={1}
        value={value}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
