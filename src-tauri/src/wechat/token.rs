use std::path::Path;
use std::time::{Duration, Instant};

use crate::state::{WechatState, WechatTokenCache};

use super::creds::wechat_get_cred;
use super::{WECHAT_APP_ID_KEY, WECHAT_APP_SECRET_KEY};

pub(crate) const DEFAULT_WECHAT_API_BASE: &str = "https://api.weixin.qq.com";

pub(crate) async fn wechat_get_or_refresh_token(
    creds_path: &Path,
    wechat_state: &WechatState,
) -> Result<String, String> {
    // Match wechat_publish_draft's 30s bound — a stalled cgi-bin/token
    // endpoint should surface as an error rather than hang the publish action
    // (or any caller awaiting the token).
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to initialize WeChat HTTP client: {e}"))?;
    wechat_get_or_refresh_token_with(&client, DEFAULT_WECHAT_API_BASE, creds_path, wechat_state)
        .await
}

/// Inner token-fetch variant with an injectable client + API base. The
/// public wrapper uses a fresh client and the prod base URL; tests use
/// a `.no_proxy()` client (so mockito's 127.0.0.1 server isn't intercepted
/// by macOS system proxies) and `server.url()`.
pub(crate) async fn wechat_get_or_refresh_token_with(
    client: &reqwest::Client,
    api_base: &str,
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
        "{}/cgi-bin/token?grant_type=client_credential&appid={}&secret={}",
        api_base, app_id, app_secret
    );
    // Strip the URL from reqwest errors — the token endpoint URL carries
    // appid + secret as query params, which would otherwise surface in error
    // toasts and logs.
    let resp: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error fetching WeChat token: {}", e.without_url()))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse WeChat token response: {}", e.without_url()))?;

    if let Some(errcode) = resp.get("errcode").and_then(|v| v.as_i64()) {
        if errcode != 0 {
            let errmsg = resp
                .get("errmsg")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::WechatState;
    use mockito::{Matcher, Server};
    use std::sync::Mutex;
    use std::time::Duration;
    use tempfile::TempDir;

    /// Smoke test that mockito + reqwest + tokio dev-deps are wired
    /// correctly. Distinct from the real token-fetch tests below.
    #[tokio::test]
    async fn mockito_with_reqwest_smoke() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/ping")
            .with_status(200)
            .with_header("content-type", "text/plain")
            .with_body("pong")
            .create_async()
            .await;

        let url = format!("{}/ping", server.url());
        // Explicit no-proxy client — macOS's system proxies otherwise
        // intercept the 127.0.0.1 request and return 502.
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let resp = client.get(&url).send().await.unwrap();
        let status = resp.status();
        let body = resp.text().await.unwrap();
        assert_eq!(status, 200, "unexpected status {status}: body={body:?}");
        assert_eq!(body, "pong");
        mock.assert_async().await;
    }

    // ── Token fetch + cache tests ─────────────────────────────────────────

    fn write_creds(dir: &Path, app_id: &str, app_secret: &str) -> std::path::PathBuf {
        let path = dir.join("creds.json");
        let body = serde_json::json!({
            WECHAT_APP_ID_KEY: app_id,
            WECHAT_APP_SECRET_KEY: app_secret,
        });
        std::fs::write(&path, body.to_string()).unwrap();
        path
    }

    fn empty_state() -> WechatState {
        WechatState {
            token_cache: Mutex::new(None),
        }
    }

    fn no_proxy_client() -> reqwest::Client {
        reqwest::Client::builder().no_proxy().build().unwrap()
    }

    #[tokio::test]
    async fn token_fetch_hits_the_endpoint_and_caches_the_result() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/cgi-bin/token")
            .match_query(Matcher::AllOf(vec![
                Matcher::UrlEncoded("grant_type".into(), "client_credential".into()),
                Matcher::UrlEncoded("appid".into(), "wx_test".into()),
                Matcher::UrlEncoded("secret".into(), "secret_test".into()),
            ]))
            .with_status(200)
            .with_body(r#"{"access_token":"ACCESS_TOKEN_XYZ","expires_in":7200}"#)
            .create_async()
            .await;

        let dir = TempDir::new().unwrap();
        let creds = write_creds(dir.path(), "wx_test", "secret_test");
        let state = empty_state();
        let client = no_proxy_client();

        let token = wechat_get_or_refresh_token_with(&client, &server.url(), &creds, &state)
            .await
            .expect("token fetch");

        assert_eq!(token, "ACCESS_TOKEN_XYZ");
        mock.assert_async().await;

        let cached = state.token_cache.lock().unwrap();
        let cached = cached.as_ref().expect("cache populated");
        assert_eq!(cached.app_id, "wx_test");
        assert_eq!(cached.access_token, "ACCESS_TOKEN_XYZ");
    }

    #[tokio::test]
    async fn cache_hit_skips_the_http_call() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/cgi-bin/token")
            .match_query(Matcher::Any)
            .expect(0) // any call here is a test failure
            .with_status(200)
            .create_async()
            .await;

        let dir = TempDir::new().unwrap();
        let creds = write_creds(dir.path(), "wx_test", "secret_test");
        let state = WechatState {
            token_cache: Mutex::new(Some(WechatTokenCache {
                app_id: "wx_test".to_string(),
                access_token: "CACHED_TOKEN".to_string(),
                expires_at: Instant::now() + Duration::from_secs(3600),
            })),
        };
        let client = no_proxy_client();

        let token = wechat_get_or_refresh_token_with(&client, &server.url(), &creds, &state)
            .await
            .expect("token fetch");

        assert_eq!(token, "CACHED_TOKEN");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn expired_cache_triggers_a_fresh_fetch() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/cgi-bin/token")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"access_token":"FRESH_TOKEN","expires_in":7200}"#)
            .create_async()
            .await;

        let dir = TempDir::new().unwrap();
        let creds = write_creds(dir.path(), "wx_test", "secret_test");
        // expires_at already passed → cache miss.
        let state = WechatState {
            token_cache: Mutex::new(Some(WechatTokenCache {
                app_id: "wx_test".to_string(),
                access_token: "STALE_TOKEN".to_string(),
                expires_at: Instant::now()
                    .checked_sub(Duration::from_secs(60))
                    .unwrap_or_else(Instant::now),
            })),
        };
        let client = no_proxy_client();

        let token = wechat_get_or_refresh_token_with(&client, &server.url(), &creds, &state)
            .await
            .expect("token fetch");

        assert_eq!(token, "FRESH_TOKEN");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn cached_token_for_different_appid_is_ignored() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/cgi-bin/token")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"access_token":"NEW_TOKEN","expires_in":7200}"#)
            .create_async()
            .await;

        let dir = TempDir::new().unwrap();
        let creds = write_creds(dir.path(), "wx_new", "secret_new");
        // Cache holds a token for a DIFFERENT app_id; the helper should bypass.
        let state = WechatState {
            token_cache: Mutex::new(Some(WechatTokenCache {
                app_id: "wx_old".to_string(),
                access_token: "OLD_TOKEN".to_string(),
                expires_at: Instant::now() + Duration::from_secs(3600),
            })),
        };
        let client = no_proxy_client();

        let token = wechat_get_or_refresh_token_with(&client, &server.url(), &creds, &state)
            .await
            .expect("token fetch");

        assert_eq!(token, "NEW_TOKEN");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn http_errcode_surfaces_as_err() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/cgi-bin/token")
            .match_query(Matcher::Any)
            .with_status(200)
            .with_body(r#"{"errcode":40013,"errmsg":"invalid appid"}"#)
            .create_async()
            .await;

        let dir = TempDir::new().unwrap();
        let creds = write_creds(dir.path(), "wx_bad", "secret_bad");
        let state = empty_state();
        let client = no_proxy_client();

        let err = wechat_get_or_refresh_token_with(&client, &server.url(), &creds, &state)
            .await
            .expect_err("should propagate WeChat errcode");

        assert!(err.contains("40013"), "expected errcode in message: {err}");
        assert!(
            err.contains("invalid appid"),
            "expected errmsg in message: {err}"
        );
        // Cache should NOT be populated on error.
        assert!(state.token_cache.lock().unwrap().is_none());
        mock.assert_async().await;
    }
}
