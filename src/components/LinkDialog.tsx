import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

interface LinkDialogProps {
  initialHref: string;
  onApply: (url: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

export function LinkDialog({ initialHref, onApply, onRemove, onCancel }: LinkDialogProps) {
  const [url, setUrl] = useState(initialHref);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        className="w-[360px] max-w-[calc(100vw-48px)]"
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>Insert link</DialogTitle>
        </DialogHeader>

        <Input
          ref={inputRef}
          type="url"
          value={url}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onApply(url.trim());
          }}
        />

        <DialogFooter>
          {initialHref && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="mr-auto text-[var(--color-warning)] hover:bg-[var(--color-warning-light)] hover:text-[var(--color-warning)]"
            >
              Remove
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!url.trim()}
            onClick={() => url.trim() && onApply(url.trim())}
            className="border-primary text-primary hover:bg-primary/10"
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
