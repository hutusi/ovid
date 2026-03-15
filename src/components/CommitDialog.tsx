import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface CommitDialogProps {
  defaultMessage: string;
  branch: string;
  onCommit: (message: string, push: boolean) => void;
  onCancel: () => void;
}

export function CommitDialog({ defaultMessage, branch, onCommit, onCancel }: CommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [push, setPush] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && message.trim()) {
      onCommit(message.trim(), push);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="w-[400px] max-w-[calc(100vw-48px)]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-muted-foreground shrink-0">Branch</span>
            <code className="text-xs text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
              {branch}
            </code>
          </div>

          <textarea
            ref={inputRef}
            className="w-full text-sm font-[var(--font-ui)] text-foreground bg-muted border border-input rounded-md px-3 py-2 outline-none resize-y min-h-[72px] leading-relaxed focus:border-ring transition-colors"
            value={message}
            placeholder="Commit message"
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={push}
              onChange={(e) => setPush(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-muted-foreground">Push after commit</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!message.trim()}
            onClick={() => message.trim() && onCommit(message.trim(), push)}
            className="border-primary text-primary hover:bg-primary/10"
          >
            Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
