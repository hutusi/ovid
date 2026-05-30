use std::path::PathBuf;
use std::time::Duration;

use tauri::{Emitter, State};

use crate::state::{WechatPublishResult, WechatState, WechatUploadProgress, WorkspaceState};

use super::creds::wechat_creds_path;
use super::token::{wechat_get_or_refresh_token, DEFAULT_WECHAT_API_BASE};
use super::upload::{
    extract_img_srcs, remove_img_tag, resolve_wechat_asset_path, wechat_upload_body_image,
    wechat_upload_thumb,
};

/// Outcome of an update-draft call. The publish workflow uses this to decide
/// between "report updated" and "fall through to create".
#[derive(Debug)]
pub(crate) enum DraftUpdateOutcome {
    Updated,
    Invalid, // errcode 40007 — fall through to create
}

/// POST a new draft to /cgi-bin/draft/add. Returns the assigned media_id.
/// Pure async helper — no Tauri state, no app handle. Tested via mockito.
pub(crate) async fn create_wechat_draft(
    client: &reqwest::Client,
    api_base: &str,
    token: &str,
    article: serde_json::Value,
) -> Result<String, String> {
    let body = serde_json::json!({ "articles": [article] });
    let url = format!("{}/cgi-bin/draft/add?access_token={}", api_base, token);

    let resp: serde_json::Value = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Draft creation network error: {}", e.without_url()))?
        .json()
        .await
        .map_err(|e| format!("Draft creation parse error: {}", e.without_url()))?;

    if let Some(errcode) = resp.get("errcode").and_then(|v| v.as_i64()) {
        if errcode != 0 {
            let errmsg = resp.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
            return Err(format!("WeChat draft creation error {}: {}", errcode, errmsg));
        }
    }

    resp.get("media_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No media_id in WeChat draft response: {resp}"))
}

/// POST to /cgi-bin/draft/update. Returns:
/// - `Ok(DraftUpdateOutcome::Updated)` when WeChat accepted the update.
/// - `Ok(DraftUpdateOutcome::Invalid)` when WeChat returned errcode 40007
///   (invalid/expired media_id) — caller should fall through to create.
/// - `Err(_)` for any other errcode (including a missing errcode, which we
///   treat as malformed — silently succeeding would write a bogus media_id
///   back to frontmatter while no update actually happened).
pub(crate) async fn update_wechat_draft(
    client: &reqwest::Client,
    api_base: &str,
    token: &str,
    existing_media_id: &str,
    article: serde_json::Value,
) -> Result<DraftUpdateOutcome, String> {
    let body = serde_json::json!({
        "media_id": existing_media_id,
        "index": 0,
        "articles": article,
    });
    let url = format!("{}/cgi-bin/draft/update?access_token={}", api_base, token);

    let resp: serde_json::Value = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Draft update network error: {}", e.without_url()))?
        .json()
        .await
        .map_err(|e| format!("Draft update parse error: {}", e.without_url()))?;

    match resp.get("errcode").and_then(|v| v.as_i64()) {
        Some(0) => Ok(DraftUpdateOutcome::Updated),
        Some(40007) => Ok(DraftUpdateOutcome::Invalid),
        Some(errcode) => {
            let errmsg = resp.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
            Err(format!("WeChat draft update error {}: {}", errcode, errmsg))
        }
        None => Err(format!(
            "Malformed WeChat draft update response (no errcode): {resp}"
        )),
    }
}

/// Return the items in `input` with duplicates removed, preserving first-occurrence order.
/// Used to dedupe `<img src>` values before upload — `String::replace` rewrites every
/// occurrence at once, so re-iterating duplicates would waste API quota and discard URLs.
fn dedupe_preserving_order(input: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    input.into_iter().filter(|s| seen.insert(s.clone())).collect()
}

#[tauri::command]
pub(crate) async fn wechat_publish_draft(
    app: tauri::AppHandle,
    title: String,
    author: String,
    digest: Option<String>,
    html: String,
    base_dir: String,
    asset_root: Option<String>,
    cover_image_path: Option<String>,
    existing_media_id: Option<String>,
    content_source_url: Option<String>,
    need_open_comment: bool,
    can_reward: bool,
    workspace_state: State<'_, WorkspaceState>,
    wechat_state: State<'_, WechatState>,
) -> Result<WechatPublishResult, String> {
    let workspace_root = workspace_state
        .workspace_root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("no workspace open")?;

    let creds_path = wechat_creds_path(&app)?;
    let token = wechat_get_or_refresh_token(&creds_path, &wechat_state).await?;
    // Bound network calls so a stalled WeChat endpoint surfaces as an error
    // rather than hanging the publish action indefinitely.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to initialize WeChat HTTP client: {e}"))?;
    let base = if base_dir.trim().is_empty() {
        workspace_root.clone()
    } else {
        std::fs::canonicalize(&base_dir)
            .map_err(|e| format!("Cannot access file directory \"{base_dir}\": {e}"))?
    };
    let asset_root_path = asset_root
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);

    // Upload cover image as permanent material to get thumb_media_id (optional)
    let thumb_id = match cover_image_path {
        Some(ref p) if !p.is_empty() => {
            let cover_path =
                resolve_wechat_asset_path(&workspace_root, &base, asset_root_path.as_deref(), p)
                    .map_err(|_| format!("Cover image not found: \"{p}\""))?;
            Some(wechat_upload_thumb(&client, &token, &cover_path).await?)
        }
        _ => None,
    };

    // Upload body images (local file paths only) and replace src attributes.
    // Non-local schemes (http, https, asset://, data:, blob:) are skipped.
    // Images that cannot be resolved are skipped rather than aborting the draft.
    //
    // Dedupe srcs preserving first-occurrence order: `String::replace` rewrites
    // every occurrence of a pattern at once, so two `<img>` tags pointing at the
    // same local path would otherwise be uploaded twice — wasting WeChat quota
    // and discarding the second URL (the `replace` finds no remaining matches).
    let srcs = dedupe_preserving_order(extract_img_srcs(&html));
    let is_non_local_src = |s: &str| {
        s.starts_with("http://")
            || s.starts_with("https://")
            || s.starts_with("asset://")
            || s.starts_with("data:")
            || s.starts_with("blob:")
    };
    let mut local_image_total = srcs.iter().filter(|s| !is_non_local_src(s)).count();
    let mut local_image_current = 0usize;
    let mut processed_html = html;
    for src in srcs {
        if is_non_local_src(&src) {
            continue;
        }
        let img_path = match resolve_wechat_asset_path(
            &workspace_root,
            &base,
            asset_root_path.as_deref(),
            &src,
        ) {
            Ok(p) => p,
            Err(_) => {
                // Path can't be resolved — strip the <img> tag to avoid sending
                // a broken local path to WeChat. Adjust total so the progress
                // counter stays consistent with the number of uploads attempted.
                processed_html = remove_img_tag(&processed_html, &src);
                local_image_total = local_image_total.saturating_sub(1);
                continue;
            }
        };
        let wechat_url = wechat_upload_body_image(&client, &token, &img_path).await?;
        local_image_current += 1;
        let _ = app.emit(
            "wechat-upload-progress",
            WechatUploadProgress {
                current: local_image_current,
                total: local_image_total,
            },
        );
        processed_html = processed_html.replace(
            &format!("src=\"{}\"", src),
            &format!("src=\"{}\"", wechat_url),
        );
    }

    // Build article object; include optional fields only when present
    let mut article = serde_json::json!({
        "title": title,
        "author": author,
        "content": processed_html
    });
    if let Some(ref d) = digest {
        if !d.is_empty() {
            article["digest"] = serde_json::Value::String(d.clone());
        }
    }
    if let Some(ref id) = thumb_id {
        article["thumb_media_id"] = serde_json::Value::String(id.clone());
    }
    if let Some(ref url) = content_source_url {
        if !url.is_empty() {
            article["content_source_url"] = serde_json::Value::String(url.clone());
        }
    }
    article["need_open_comment"] = serde_json::json!(if need_open_comment { 1 } else { 0 });
    article["can_reward"] = serde_json::json!(if can_reward { 1 } else { 0 });

    // Update existing draft if a media_id was provided. On 40007 (invalid
    // media_id) fall through to create; on any other errcode propagate.
    if let Some(ref existing_id) = existing_media_id {
        match update_wechat_draft(
            &client,
            DEFAULT_WECHAT_API_BASE,
            &token,
            existing_id,
            article.clone(),
        )
        .await?
        {
            DraftUpdateOutcome::Updated => {
                return Ok(WechatPublishResult {
                    media_id: existing_id.clone(),
                    updated: true,
                });
            }
            DraftUpdateOutcome::Invalid => {
                // Fall through to create_wechat_draft below.
            }
        }
    }

    let media_id =
        create_wechat_draft(&client, DEFAULT_WECHAT_API_BASE, &token, article).await?;

    Ok(WechatPublishResult {
        media_id,
        updated: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn dedupe_preserving_order_removes_repeated_entries_keeping_first() {
        let result = dedupe_preserving_order(s(&["a.png", "b.png", "a.png", "c.png", "b.png"]));
        assert_eq!(result, s(&["a.png", "b.png", "c.png"]));
    }

    #[test]
    fn dedupe_preserving_order_leaves_unique_input_unchanged() {
        let input = s(&["a.png", "b.png", "c.png"]);
        assert_eq!(dedupe_preserving_order(input.clone()), input);
    }

    #[test]
    fn dedupe_preserving_order_handles_empty_input() {
        assert_eq!(dedupe_preserving_order(Vec::<String>::new()), Vec::<String>::new());
    }

    #[test]
    fn dedupe_preserving_order_collapses_duplicate_img_srcs_from_html() {
        // End-to-end check: the publish loop's input pipeline (extract_img_srcs
        // → dedupe) must yield each unique src exactly once, otherwise a single
        // local file would be uploaded multiple times to WeChat.
        let html = r#"<p><img src="images/a.png"/><img src="images/b.png"/><img src="images/a.png"/></p>"#;
        let result = dedupe_preserving_order(extract_img_srcs(html));
        assert_eq!(result, s(&["images/a.png", "images/b.png"]));
    }

    // ── create_wechat_draft / update_wechat_draft (mockito) ─────────────────

    use mockito::{Matcher, Server};

    fn no_proxy_client() -> reqwest::Client {
        reqwest::Client::builder().no_proxy().build().unwrap()
    }

    fn article() -> serde_json::Value {
        serde_json::json!({
            "title": "My post",
            "author": "me",
            "content": "<p>Hello</p>",
        })
    }

    #[tokio::test]
    async fn create_wechat_draft_returns_media_id_on_success() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/cgi-bin/draft/add")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"media_id":"DRAFT_ID_42"}"#)
            .create_async()
            .await;

        let media_id = create_wechat_draft(&no_proxy_client(), &server.url(), "TOKEN", article())
            .await
            .expect("create draft");

        assert_eq!(media_id, "DRAFT_ID_42");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn create_wechat_draft_returns_err_on_nonzero_errcode() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("POST", "/cgi-bin/draft/add")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"errcode":40001,"errmsg":"invalid credential"}"#)
            .create_async()
            .await;

        let err = create_wechat_draft(&no_proxy_client(), &server.url(), "TOKEN", article())
            .await
            .expect_err("nonzero errcode");

        assert!(err.contains("40001"));
        assert!(err.contains("invalid credential"));
    }

    #[tokio::test]
    async fn update_wechat_draft_signals_updated_on_errcode_zero() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/cgi-bin/draft/update")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"errcode":0,"errmsg":"ok"}"#)
            .create_async()
            .await;

        let outcome =
            update_wechat_draft(&no_proxy_client(), &server.url(), "TOKEN", "MEDIA_ID", article())
                .await
                .expect("update draft");

        assert!(matches!(outcome, DraftUpdateOutcome::Updated));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn update_wechat_draft_signals_invalid_on_errcode_40007() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("POST", "/cgi-bin/draft/update")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"errcode":40007,"errmsg":"invalid media_id"}"#)
            .create_async()
            .await;

        let outcome = update_wechat_draft(
            &no_proxy_client(),
            &server.url(),
            "TOKEN",
            "STALE_MEDIA_ID",
            article(),
        )
        .await
        .expect("update draft handles 40007");

        // The publish workflow uses this signal to fall through to create.
        assert!(matches!(outcome, DraftUpdateOutcome::Invalid));
    }

    #[tokio::test]
    async fn update_wechat_draft_treats_missing_errcode_as_error() {
        let mut server = Server::new_async().await;
        let _mock = server
            .mock("POST", "/cgi-bin/draft/update")
            .match_query(Matcher::Any)
            .with_status(200)
            // No errcode field — malformed body, treated as error so we don't
            // silently write a bogus media_id back to frontmatter.
            .with_body(r#"{"some_other_field":"value"}"#)
            .create_async()
            .await;

        let err = update_wechat_draft(
            &no_proxy_client(),
            &server.url(),
            "TOKEN",
            "MEDIA_ID",
            article(),
        )
        .await
        .expect_err("missing errcode treated as malformed");

        assert!(err.contains("no errcode") || err.contains("Malformed"), "unexpected error: {err}");
    }
}
