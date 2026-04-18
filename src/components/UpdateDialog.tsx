import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import {
  check,
  type DownloadEvent,
  type Update as PendingUpdate,
} from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./UpdateDialog.css";

interface UpdateDialogProps {
  onBeforeRestart?: () => Promise<void>;
  onClose: () => void;
}

type UpdateState =
  | { kind: "checking"; currentVersion: string | null }
  | { kind: "upToDate"; currentVersion: string }
  | {
      kind: "available";
      currentVersion: string;
      version: string;
      date?: string;
      notes?: string;
    }
  | {
      kind: "installing";
      currentVersion: string;
      version: string;
      downloadedBytes: number;
      contentLength?: number;
    }
  | { kind: "installed"; currentVersion: string; version: string; restartPending: boolean }
  | { kind: "error"; currentVersion: string | null; message: string };

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateDialog({ onBeforeRestart, onClose }: UpdateDialogProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const updateRef = useRef<PendingUpdate | null>(null);
  const mountedRef = useRef(true);
  const [state, setState] = useState<UpdateState>({ kind: "checking", currentVersion: null });

  const runCheck = useCallback(async (currentVersionOverride?: string | null) => {
    updateRef.current?.close().catch(() => {});
    updateRef.current = null;

    try {
      const currentVersion = currentVersionOverride ?? (await getVersion());
      if (!mountedRef.current) return;
      setState({ kind: "checking", currentVersion });

      const update = await check();
      if (!mountedRef.current) {
        await update?.close();
        return;
      }

      updateRef.current = update;
      if (!update) {
        setState({ kind: "upToDate", currentVersion });
        return;
      }

      setState({
        kind: "available",
        currentVersion,
        version: update.version,
        date: update.date,
        notes: update.body,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setState({
        kind: "error",
        currentVersion: currentVersionOverride ?? null,
        message: getErrorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void runCheck();

    return () => {
      mountedRef.current = false;
      const pendingUpdate = updateRef.current;
      updateRef.current = null;
      if (pendingUpdate) {
        void pendingUpdate.close().catch(() => {});
      }
    };
  }, [runCheck]);

  async function handleInstall() {
    const pendingUpdate = updateRef.current;
    if (!pendingUpdate || state.kind !== "available") return;

    setState({
      kind: "installing",
      currentVersion: state.currentVersion,
      version: state.version,
      downloadedBytes: 0,
    });

    try {
      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (!mountedRef.current) return;
        setState((currentState) => {
          if (currentState.kind !== "installing") return currentState;

          switch (event.event) {
            case "Started":
              return {
                ...currentState,
                contentLength: event.data.contentLength,
                downloadedBytes: 0,
              };
            case "Progress":
              return {
                ...currentState,
                downloadedBytes: currentState.downloadedBytes + event.data.chunkLength,
              };
            case "Finished":
              return currentState;
            default:
              return currentState;
          }
        });
      });

      await pendingUpdate.close();
      if (!mountedRef.current) return;
      updateRef.current = null;
      setState({
        kind: "installed",
        currentVersion: state.currentVersion,
        version: state.version,
        restartPending: false,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setState({
        kind: "error",
        currentVersion: state.currentVersion,
        message: getErrorMessage(error),
      });
    }
  }

  async function handleRestart() {
    if (state.kind !== "installed" || state.restartPending) return;
    setState({ ...state, restartPending: true });
    await onBeforeRestart?.();
    await invoke("restart_app");
  }

  function handleRetry() {
    void runCheck(state.currentVersion);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && state.kind !== "installing") {
      event.stopPropagation();
      onClose();
    }
  }

  const progressText =
    state.kind === "installing"
      ? state.contentLength != null
        ? `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.contentLength)}`
        : `${formatBytes(state.downloadedBytes)} downloaded`
      : null;

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close"
        disabled={state.kind === "installing"}
        onClick={() => {
          if (state.kind === "installing") return;
          onClose();
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Check for updates"
        className="modal-panel update-dialog"
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">Check for Updates</p>

        {state.currentVersion && (
          <div className="modal-branch-row">
            <span className="modal-branch-label">Current</span>
            <code className="modal-badge">{state.currentVersion}</code>
          </div>
        )}

        {state.kind === "checking" && (
          <p className="modal-copy">
            Checking the configured updater endpoint for a newer release…
          </p>
        )}

        {state.kind === "upToDate" && (
          <p className="modal-copy">Ovid is up to date. No newer version is currently available.</p>
        )}

        {state.kind === "available" && (
          <>
            <div className="modal-branch-row">
              <span className="modal-branch-label">Latest</span>
              <code className="modal-badge">{state.version}</code>
            </div>
            {state.date && <p className="modal-copy">Published {formatDate(state.date)}</p>}
            <p className="modal-copy">A newer version is available and ready to install.</p>
            {state.notes && <pre className="update-dialog-notes">{state.notes}</pre>}
          </>
        )}

        {state.kind === "installing" && (
          <>
            <div className="modal-branch-row">
              <span className="modal-branch-label">Installing</span>
              <code className="modal-badge">{state.version}</code>
            </div>
            <p className="modal-copy">Downloading and preparing the update package…</p>
            {progressText && <p className="update-dialog-progress">{progressText}</p>}
          </>
        )}

        {state.kind === "installed" && (
          <>
            <div className="modal-branch-row">
              <span className="modal-branch-label">Ready</span>
              <code className="modal-badge">{state.version}</code>
            </div>
            <p className="modal-copy">
              The update package has been installed. Restart Ovid now to finish applying the new
              version.
            </p>
          </>
        )}

        {state.kind === "error" && <p className="update-dialog-error">{state.message}</p>}

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button
            type="button"
            className="modal-btn modal-btn-cancel"
            onClick={onClose}
            disabled={state.kind === "installing"}
          >
            {state.kind === "upToDate" ? "Close" : "Cancel"}
          </button>
          {state.kind === "available" && (
            <button type="button" className="modal-btn modal-btn-primary" onClick={handleInstall}>
              Install Update
            </button>
          )}
          {state.kind === "error" && (
            <button type="button" className="modal-btn modal-btn-primary" onClick={handleRetry}>
              Retry
            </button>
          )}
          {state.kind === "installed" && (
            <button
              type="button"
              className="modal-btn modal-btn-primary"
              onClick={() => void handleRestart()}
              disabled={state.restartPending}
            >
              {state.restartPending ? "Restarting…" : "Restart Now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
