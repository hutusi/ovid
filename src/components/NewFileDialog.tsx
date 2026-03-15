import { useEffect, useRef, useState } from "react";
import type { ContentType } from "../lib/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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
      <DialogContent className="w-[320px] max-w-[calc(100vw-48px)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            ref={inputRef}
            value={filename}
            placeholder="filename"
            onChange={(e) => setFilename(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {!preselectedType && contentTypes.length > 0 && (
            <div className="flex items-center gap-2.5">
              <Label htmlFor="new-file-type" className="text-xs text-muted-foreground shrink-0">
                Type
              </Label>
              <select
                id="new-file-type"
                className="flex-1 text-sm font-[var(--font-ui)] text-foreground bg-muted border border-input rounded-md px-2 py-1.5 outline-none focus:border-ring transition-colors cursor-pointer"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                {contentTypes.map((ct) => (
                  <option key={ct.name} value={ct.name}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!filename.trim()}
            onClick={handleConfirm}
            className="border-primary text-primary hover:bg-primary/10"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
