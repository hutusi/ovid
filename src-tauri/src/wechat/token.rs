use std::path::Path;
use std::time::Instant;

use crate::state::{WechatState, WechatTokenCache};

use super::creds::wechat_get_cred;
use super::{WECHAT_APP_ID_KEY, WECHAT_APP_SECRET_KEY};

pub(crate) async fn wechat_get_or_refresh_token(
    creds_path: &Path,
    wechat_state: &WechatState,
) -> Result<String, String> {
    let app_id = wechat_get_cred(creds_path, WECHAT_APP_ID_KEY)?
        .ok_or_else(|| "WeChat credentials not configured. Use File > Save Draft to WeChat to set up your AppID and AppSecret.".to_string())?;

    {
        let cache = wechat_state.token_cache.lock().map_err(|e| e.to_string())?;
        if let Some(ref cached) = *cache {
            if cached.app_id == app_id && cached.expires_at > Instant::now() {
                return Ok(cached.access_token.clone());
            }
        }
    }

    let app_secret = wechat_get_cred(creds_path, WECHAT_APP_SECRET_KEY)?
        .ok_or_else(|| "WeChat credentials not configured.".to_string())?;

    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={}&secret={}",
        app_id, app_secret
    );
    // Strip the URL from reqwest errors — the token endpoint URL carries
    // appid + secret as query params, which would otherwise surface in error
    // toasts and logs.
    let resp: serde_json::Value = reqwest::get(&url)
        .await
        .map_err(|e| format!("Network error fetching WeChat token: {}", e.without_url()))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse WeChat token response: {}", e.without_url()))?;

    if let Some(errcode) = resp.get("errcode").and_then(|v| v.as_i64()) {
        if errcode != 0 {
            let errmsg = resp.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
            return Err(format!("WeChat token error {}: {}", errcode, errmsg));
        }
    }

    let token = resp
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("No access_token in WeChat response: {}", resp))?
        .to_string();

    let mut cache = wechat_state.token_cache.lock().map_err(|e| e.to_string())?;
    *cache = Some(WechatTokenCache {
        app_id,
        access_token: token.clone(),
        // Expire 200 seconds before the real 7200s window for safety
        expires_at: Instant::now() + std::time::Duration::from_secs(7000),
    });

    Ok(token)
}
