import { useEffect, useRef, useState } from "react";
import type { ContentType } from "../lib/types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

interface NewFileDialogProps {
  contentTypes: ContentType[];
  preselectedType?: string;
  onConfirm: (filename: string, contentType?: string) => void;
  onCancel: () => void;
}

export function NewFileDialog({
  contentTypes,
  preselectedType,
  onConfirm,
  onCancel,
}: NewFileDialogProps) {
  const [filename, setFilename] = useState("");
  const [selectedType, setSelectedType] = useState<string>(contentTypes[0]?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep selectedType in sync if contentTypes arrive after mount
  useEffect(() => {
    if (
      !preselectedType &&
      contentTypes.length > 0 &&
      !contentTypes.some((ct) => ct.name === selectedType)
    ) {
      setSelectedType(contentTypes[0].name);
    }
  }, [contentTypes, selectedType, preselectedType]);

  function handleConfirm() {
    const name = filename.trim();
    if (!name) return;
    const type = preselectedType ?? (contentTypes.length > 0 ? selectedType : undefined);
    onConfirm(name, type);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && filename.trim()) handleConfirm();
  }

  const title = preselectedType
    ? `New ${preselectedType.charAt(0).toUpperCase()}${preselectedType.slice(1)}`
    : "New file";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="w-[320px] max-w-[calc(100vw-48px)] p-5 gap-4" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            ref={inputRef}
            value={filename}
            placeholder="filename"
            onChange={(e) => setFilename(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-[13px]"
          />

          {!preselectedType && contentTypes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                Type
              </span>
              <div className="flex flex-wrap gap-1">
                {contentTypes.map((ct) => (
                  <button
                    key={ct.name}
                    type="button"
                    onClick={() => setSelectedType(ct.name)}
                    className={cn(
                      "px-2.5 py-[3px] rounded text-[11.5px] capitalize transition-colors",
                      selectedType === ct.name
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground bg-muted hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {ct.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!filename.trim()}
            onClick={handleConfirm}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
