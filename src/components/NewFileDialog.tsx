import { useEffect, useRef, useState } from "react";
import type { ContentType } from "../lib/types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
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
      <DialogContent className="w-[300px] max-w-[calc(100vw-48px)] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Filename with .md suffix */}
          <div className="flex items-center">
            <Input
              ref={inputRef}
              value={filename}
              placeholder="filename"
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 rounded-r-none border-r-0 h-8 text-[13px] focus-visible:z-10"
            />
            <span className="flex items-center h-8 px-2 rounded-r-md border border-input bg-muted text-[11.5px] text-muted-foreground font-mono shrink-0">
              .md
            </span>
          </div>

          {/* Content type chips */}
          {!preselectedType && contentTypes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground px-0.5">
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

        <DialogFooter className="flex-row justify-end gap-1.5 pt-0">
          <Button variant="ghost" size="sm" onClick={onCancel}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
