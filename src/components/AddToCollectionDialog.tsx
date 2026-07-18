import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CollectionCandidate, CollectionItem } from "../lib/collection";
import { Modal } from "./Modal";
import { Input } from "./ui/input";
import "./FileSwitcher.css";

interface AddToCollectionDialogProps {
  candidates: CollectionCandidate[];
  onConfirm: (item: CollectionItem) => void;
  onCancel: () => void;
}

export function AddToCollectionDialog({
  candidates,
  onConfirm,
  onCancel,
}: AddToCollectionDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? candidates.filter((c) => c.label.toLowerCase().includes(q) || c.key.includes(q))
      : candidates;
    return matched.slice(0, 50);
  }, [candidates, query]);

  function handleMove(delta: number) {
    if (results.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleMove(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      handleMove(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = results[activeIndex];
      if (active) onConfirm(active.item);
    }
  }

  const title = t("sidebar.add_to_collection");
  return (
    <Modal
      ariaLabel={title}
      onClose={onCancel}
      bare
      panelClassName="fs-panel"
      placement="top"
      onKeyDown={handleKeyDown}
    >
      <div className="fs-search-row">
        <Search className="fs-search-icon" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          placeholder={t("collection_dialog.search_placeholder")}
          className="fs-search-input"
          aria-label={t("collection_dialog.search_label")}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="atc-listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            results.length > 0 && activeIndex >= 0 && activeIndex < results.length
              ? `atc-option-${activeIndex}`
              : undefined
          }
        />
      </div>
      <div className="fs-list" id="atc-listbox" role="listbox" aria-label={title}>
        {results.length === 0 ? (
          <div className="fs-empty">{t("collection_dialog.no_match")}</div>
        ) : (
          results.map((candidate, index) => (
            <button
              key={candidate.key}
              type="button"
              id={`atc-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`fs-item${index === activeIndex ? " is-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onConfirm(candidate.item)}
            >
              <span className="fs-item-title">{candidate.label}</span>
              <span className="fs-item-path">{candidate.kind}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
