import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../lib/useFocusTrap";
import { markdownToWechatHtml } from "../lib/wechatHtml";
import "./Modal.css";

interface WechatCredStatus {
  app_id: string | null;
  has_secret: boolean;
}

interface WechatPublishResult {
  media_id: string;
}

interface Props {
  title: string;
  author: string;
  markdown: string;
  baseDir: string;
  coverImagePath: string | null;
  onClose: () => void;
}

type Phase = "loading" | "credentials" | "ready" | "publishing" | "success" | "error";

export function WechatPublishDialog({
  title,
  author,
  markdown,
  baseDir,
  coverImagePath,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const appIdRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [credStatus, setCredStatus] = useState<WechatCredStatus | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [credError, setCredError] = useState("");
  const [resultMediaId, setResultMediaId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [hasMathStripped, setHasMathStripped] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftAuthor, setDraftAuthor] = useState(author);
  const [draftDigest, setDraftDigest] = useState("");

  useEffect(() => {
    invoke<WechatCredStatus>("get_wechat_credentials_status")
      .then((status) => {
        setCredStatus(status);
        if (status.app_id) setAppId(status.app_id);
        setPhase(status.app_id && status.has_secret ? "ready" : "credentials");
      })
      .catch(() => setPhase("credentials"));
  }, []);

  async function handleSaveCredentials() {
    if (!appId.trim() || !appSecret.trim()) {
      setCredError(t("wechat.both_required"));
      return;
    }
    try {
      await invoke("set_wechat_credentials", {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      setCredStatus({ app_id: appId.trim(), has_secret: true });
      setCredError("");
      setPhase("ready");
    } catch (err) {
      setCredError(String(err));
    }
  }

  async function handlePublish() {
    setPhase("publishing");
    try {
      const { html, hasMath } = markdownToWechatHtml(markdown);
      setHasMathStripped(hasMath);
      const result = await invoke<WechatPublishResult>("wechat_publish_draft", {
        title: draftTitle,
        author: draftAuthor,
        digest: draftDigest || null,
        html,
        baseDir,
        coverImagePath,
      });
      setResultMediaId(result.media_id);
      setPhase("success");
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }

  async function handleClearCredentials() {
    try {
      await invoke("clear_wechat_credentials");
      setCredStatus(null);
      setAppId("");
      setAppSecret("");
      setCredError("");
      setPhase("credentials");
      setTimeout(() => appIdRef.current?.focus(), 0);
    } catch (err) {
      setCredError(String(err));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("wechat.title")}
        className="modal-panel"
        style={{ width: 400, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("wechat.title")}</p>

        {phase === "loading" && <p className="modal-copy">{t("wechat.loading")}</p>}

        {phase === "credentials" && (
          <>
            <p className="modal-copy">{t("wechat.credentials_desc")}</p>
            <input
              ref={appIdRef}
              className="modal-input"
              aria-label={t("wechat.app_id_label")}
              placeholder={t("wechat.app_id_placeholder")}
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
            />
            <input
              type="password"
              className="modal-input"
              aria-label={t("wechat.app_secret_label")}
              placeholder={t("wechat.app_secret_placeholder")}
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              autoComplete="new-password"
            />
            {credError && <p className="modal-copy modal-copy-warning">{credError}</p>}
            <div className="modal-actions">
              <div className="modal-spacer" />
              <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
                {t("wechat.cancel")}
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                disabled={!appId.trim() || !appSecret.trim()}
                onClick={handleSaveCredentials}
              >
                {t("wechat.save_credentials")}
              </button>
            </div>
          </>
        )}

        {phase === "ready" && (
          <>
            <p className="modal-copy">{t("wechat.ready_desc")}</p>
            {credStatus?.app_id && (
              <p className="modal-copy">
                {t("wechat.current_account", { appId: credStatus.app_id })}
              </p>
            )}
            <input
              className="modal-input"
              aria-label={t("wechat.title_label")}
              placeholder={t("wechat.title_label")}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              autoComplete="off"
            />
            <input
              className="modal-input"
              aria-label={t("wechat.author_label")}
              placeholder={t("wechat.author_label")}
              value={draftAuthor}
              onChange={(e) => setDraftAuthor(e.target.value)}
              autoComplete="off"
            />
            <input
              className="modal-input"
              aria-label={t("wechat.digest_label")}
              placeholder={t("wechat.digest_placeholder")}
              value={draftDigest}
              maxLength={54}
              onChange={(e) => setDraftDigest(e.target.value)}
              autoComplete="off"
            />
            {!coverImagePath && (
              <p className="modal-copy modal-copy-warning">{t("wechat.no_cover_warning")}</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-cancel"
                onClick={handleClearCredentials}
              >
                {t("wechat.change_account")}
              </button>
              <div className="modal-spacer" />
              <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
                {t("wechat.cancel")}
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                disabled={!draftTitle.trim()}
                onClick={handlePublish}
              >
                {t("wechat.publish_draft")}
              </button>
            </div>
          </>
        )}

        {phase === "publishing" && <p className="modal-copy">{t("wechat.publishing")}</p>}

        {phase === "success" && (
          <>
            <p className="modal-copy">{t("wechat.success_title")}</p>
            <p className="modal-copy">{t("wechat.success_media_id", { mediaId: resultMediaId })}</p>
            {hasMathStripped && (
              <p className="modal-copy modal-copy-warning">
                {t("menu.file_wechat_copy_math_warning")}
              </p>
            )}
            <p className="modal-copy">{t("wechat.success_note")}</p>
            <div className="modal-actions">
              <div className="modal-spacer" />
              <button type="button" className="modal-btn modal-btn-primary" onClick={onClose}>
                {t("wechat.done")}
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="modal-copy modal-copy-warning">
              {t("wechat.error_prefix", { error: errorMsg })}
            </p>
            <div className="modal-actions">
              <div className="modal-spacer" />
              <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
                {t("wechat.close")}
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={() => setPhase("ready")}
              >
                {t("wechat.retry")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
