use std::path::PathBuf;

use tauri::{Emitter, State};

use crate::state::{WechatPublishResult, WechatState, WechatUploadProgress, WorkspaceState};

use super::creds::wechat_creds_path;
use super::token::wechat_get_or_refresh_token;
use super::upload::{
    extract_img_srcs, remove_img_tag, resolve_wechat_asset_path, wechat_upload_body_image,
    wechat_upload_thumb,
};

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
    let client = reqwest::Client::new();
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
    let mut seen = std::collections::HashSet::new();
    let srcs: Vec<String> = extract_img_srcs(&html)
        .into_iter()
        .filter(|s| seen.insert(s.clone()))
        .collect();
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

    // Update existing draft if a media_id was provided
    if let Some(ref existing_id) = existing_media_id {
        let update_body = serde_json::json!({
            "media_id": existing_id,
            "index": 0,
            "articles": article
        });
        let update_url = format!(
            "https://api.weixin.qq.com/cgi-bin/draft/update?access_token={}",
            token
        );
        let update_resp: serde_json::Value = client
            .post(&update_url)
            .json(&update_body)
            .send()
            .await
            .map_err(|e| format!("Draft update network error: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Draft update parse error: {}", e))?;

        let errcode = update_resp
            .get("errcode")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if errcode == 0 {
            return Ok(WechatPublishResult {
                media_id: existing_id.clone(),
                updated: true,
            });
        } else if errcode != 40007 {
            // 40007 = invalid/expired media_id — fall through to create a new draft.
            // All other errors are real failures worth surfacing.
            let errmsg = update_resp
                .get("errmsg")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            return Err(format!("WeChat draft update error {}: {}", errcode, errmsg));
        }
    }

    // Create draft via WeChat API
    let draft_body = serde_json::json!({ "articles": [article] });

    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token={}",
        token
    );
    let resp: serde_json::Value = client
        .post(&url)
        .json(&draft_body)
        .send()
        .await
        .map_err(|e| format!("Draft creation network error: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Draft creation parse error: {}", e))?;

    if let Some(errcode) = resp.get("errcode").and_then(|v| v.as_i64()) {
        if errcode != 0 {
            let errmsg = resp.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
            return Err(format!("WeChat draft creation error {}: {}", errcode, errmsg));
        }
    }

    let media_id = resp
        .get("media_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("No media_id in WeChat draft response: {}", resp))?
        .to_string();

    Ok(WechatPublishResult {
        media_id,
        updated: false,
    })
}
