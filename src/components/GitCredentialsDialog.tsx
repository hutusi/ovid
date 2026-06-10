import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import { Modal, ModalActions } from "./Modal";
import "./GitCredentialsDialog.css";

export type GitCredentialsOperation = "push" | "pull" | "fetch";

export interface GitCredentialsDialogProps {
  host: string;
  remoteName: string;
  operation: GitCredentialsOperation;
  // True when a credential is already stored for this host — used to surface
  // a "forget saved credentials" link so users can recover from a bad PAT.
  hasStoredCredentials: boolean;
  // Set when a previous submit from this same dialog session failed with
  // another auth error. Drives the inline error message.
  authErrored: boolean;
  // Defaults to last known username if any (e.g. previously stored).
  initialUsername?: string;
  initialRemember?: boolean;
  onSubmit: (args: { username: string; password: string; remember: boolean }) => void;
  onForget: () => void;
  onCancel: () => void;
}

export function GitCredentialsDialog({
  host,
  remoteName,
  operation,
  hasStoredCredentials,
  authErrored,
  initialUsername = "",
  initialRemember = true,
  onSubmit,
  onForget,
  onCancel,
}: GitCredentialsDialogProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(initialRemember);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialUsername) passwordRef.current?.focus();
    else usernameRef.current?.focus();
  }, [initialUsername]);

  function canSubmit() {
    return username.trim().length > 0 && password.length > 0;
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    onSubmit({ username: username.trim(), password, remember });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canSubmit()) {
      // Avoid double-firing when focus is on the Submit button (its onClick
      // already handles activation). Mirror RenameBranchDialog's check.
      if (e.target === usernameRef.current || e.target === passwordRef.current) {
        e.preventDefault();
        handleSubmit();
      }
    }
  }

  const titleKey = `git_credentials_dialog.title_${operation}`;
  const dialogTitle = host
    ? t(titleKey, { host })
    : t(`git_credentials_dialog.title_${operation}_generic`);

  return (
    <Modal
      ariaLabel={dialogTitle}
      onClose={onCancel}
      panelClassName="gitcred-panel"
      onKeyDown={handleKeyDown}
    >
      <p className="modal-title">{dialogTitle}</p>

      <p className="modal-copy">
        {remoteName
          ? t("git_credentials_dialog.subtitle_with_remote", { remote: remoteName })
          : t("git_credentials_dialog.subtitle_generic")}
      </p>

      <p className="modal-copy gitcred-hint">{t("git_credentials_dialog.pat_hint")}</p>

      {authErrored && (
        <p className="modal-copy modal-copy-warning" role="alert">
          {t("git_credentials_dialog.error_auth_failed")}
        </p>
      )}

      <label className="gitcred-field">
        <span className="gitcred-label">{t("git_credentials_dialog.username_label")}</span>
        <input
          ref={usernameRef}
          className="modal-input"
          aria-label={t("git_credentials_dialog.username_label")}
          value={username}
          placeholder={t("git_credentials_dialog.username_placeholder")}
          autoComplete="username"
          {...PLAIN_TEXT_INPUT_PROPS}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>

      <label className="gitcred-field">
        <span className="gitcred-label">{t("git_credentials_dialog.password_label")}</span>
        <input
          ref={passwordRef}
          type="password"
          className="modal-input"
          aria-label={t("git_credentials_dialog.password_label")}
          value={password}
          placeholder={t("git_credentials_dialog.password_placeholder")}
          autoComplete="current-password"
          spellCheck={false}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <label className="gitcred-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>{t("git_credentials_dialog.remember_label")}</span>
      </label>

      {hasStoredCredentials && host && (
        <button type="button" className="gitcred-forget" onClick={onForget}>
          {t("git_credentials_dialog.forget_link", { host })}
        </button>
      )}

      <ModalActions
        cancelLabel={t("git_credentials_dialog.cancel")}
        confirmLabel={t("git_credentials_dialog.submit")}
        onCancel={onCancel}
        onConfirm={handleSubmit}
        confirmDisabled={!canSubmit()}
      />
    </Modal>
  );
}
