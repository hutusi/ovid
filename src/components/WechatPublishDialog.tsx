import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  updated: boolean;
}

interface Props {
  title: string;
  author: string;
  excerpt: string;
  hasMath: boolean;
  imageCount: number;
  markdown: string;
  baseDir: string;
  assetRoot: string | undefined;
  coverImagePath: string | null;
  existingMediaId: string | null;
  onClose: () => void;
  onSuccess: (mediaId: string, updated: boolean) => Promise<void> | void;
}

type Phase = "loading" | "credentials" | "ready" | "publishing" | "success" | "error";

export function WechatPublishDialog({
  title,
  author,
  excerpt,
  hasMath,
  imageCount,
  markdown,
  baseDir,
  assetRoot,
  coverImagePath,
  existingMediaId,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const appIdRef = useRef<HTMLInputElement>(null);

  const dismissedRef = useRef(false);
  useEffect(() => {
    return () => {
      dismissedRef.current = true;
    };
  }, []);

  const [phase, setPhase] = useState<Phase>("loading");
  const [credStatus, setCredStatus] = useState<WechatCredStatus | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [credError, setCredError] = useState("");
  const [resultMediaId, setResultMediaId] = useState("");
  const [resultUpdated, setResultUpdated] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftAuthor, setDraftAuthor] = useState(author);
  const [draftDigest, setDraftDigest] = useState(excerpt.slice(0, 54));
  const [contentSourceUrl, setContentSourceUrl] = useState("");
  const [needOpenComment, setNeedOpenComment] = useState(false);
  const [canReward, setCanReward] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null
  );

  useEffect(() => {
    invoke<WechatCredStatus>("get_wechat_credentials_status")
      .then((status) => {
        setCredStatus(status);
        if (status.app_id) setAppId(status.app_id);
        setPhase(status.app_id && status.has_secret ? "ready" : "credentials");
      })
      .catch(() => setPhase("credentials"));
  }, []);

  useEffect(() => {
    if (phase !== "publishing") return;
    setUploadProgress(null);
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<{ current: number; total: number }>("wechat-upload-progress", (event) => {
      if (!cancelled) setUploadProgress(event.payload);
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => {
        console.error("wechat-upload-progress listener error:", err);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [phase]);

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
      const { html } = markdownToWechatHtml(markdown);
      const result = await invoke<WechatPublishResult>("wechat_publish_draft", {
        title: draftTitle,
        author: draftAuthor,
        digest: draftDigest || null,
        html,
        baseDir,
        assetRoot: assetRoot ?? null,
        coverImagePath,
        existingMediaId: existingMediaId ?? null,
        contentSourceUrl: contentSourceUrl.trim() || null,
        needOpenComment,
        canReward,
      });
      if (dismissedRef.current) return;
      setResultMediaId(result.media_id);
      setResultUpdated(result.updated);
      await onSuccess(result.media_id, result.updated);
      if (dismissedRef.current) return;
      setPhase("success");
    } catch (err) {
      if (dismissedRef.current) return;
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

  const isUpdate = !!existingMediaId;

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
            <div className="modal-input-with-counter">
              <input
                className="modal-input"
                aria-label={t("wechat.digest_label")}
                placeholder={t("wechat.digest_placeholder")}
                value={draftDigest}
                maxLength={54}
                onChange={(e) => setDraftDigest(e.target.value)}
                autoComplete="off"
              />
              <div className="modal-input-counter">
                <span className={draftDigest.length >= 50 ? "modal-input-counter--warn" : ""}>
                  {draftDigest.length}/54
                </span>
              </div>
            </div>
            <input
              className="modal-input"
              aria-label={t("wechat.content_source_url_label")}
              placeholder={t("wechat.content_source_url_placeholder")}
              value={contentSourceUrl}
              onChange={(e) => setContentSourceUrl(e.target.value)}
              autoComplete="off"
              type="url"
            />
            <label className="modal-checkbox-label">
              <input
                type="checkbox"
                checked={needOpenComment}
                onChange={(e) => setNeedOpenComment(e.target.checked)}
              />
              {t("wechat.open_comment_label")}
            </label>
            <div>
              <label className="modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={canReward}
                  onChange={(e) => setCanReward(e.target.checked)}
                />
                {t("wechat.can_reward_label")}
              </label>
              <p className="modal-copy" style={{ paddingLeft: 20, marginTop: 3 }}>
                {t("wechat.can_reward_hint")}
              </p>
            </div>
            {imageCount > 0 && (
              <p className="modal-copy">{t("wechat.local_images", { count: imageCount })}</p>
            )}
            {hasMath && <p className="modal-copy modal-copy-warning">{t("wechat.math_warning")}</p>}
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
                {isUpdate ? t("wechat.update_draft") : t("wechat.publish_draft")}
              </button>
            </div>
          </>
        )}

        {phase === "publishing" && (
          <p className="modal-copy">
            {uploadProgress
              ? t("wechat.uploading_image", {
                  current: uploadProgress.current,
                  total: uploadProgress.total,
                })
              : isUpdate
                ? t("wechat.updating")
                : t("wechat.publishing")}
          </p>
        )}

        {phase === "success" && (
          <>
            <p className="modal-copy">
              {resultUpdated ? t("wechat.success_updated_title") : t("wechat.success_title")}
            </p>
            <p className="modal-copy">{t("wechat.success_media_id", { mediaId: resultMediaId })}</p>
            {hasMath && <p className="modal-copy modal-copy-warning">{t("wechat.math_warning")}</p>}
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
