use std::path::{Path, PathBuf};

use crate::paths::validate_path;

pub(crate) fn wechat_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    }
}

pub(crate) async fn wechat_upload_body_image(
    client: &reqwest::Client,
    token: &str,
    path: &Path,
) -> Result<String, String> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Cannot read image {}: {}", path.display(), e))?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image.jpg")
        .to_string();
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(wechat_mime_type(path))
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new().part("media", part);
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={}",
        token
    );
    // Strip URLs from reqwest errors — the request URL carries access_token
    // as a query param, which would otherwise surface in error toasts/logs.
    let resp: serde_json::Value = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Image upload network error: {}", e.without_url()))?
        .json()
        .await
        .map_err(|e| format!("Image upload parse error: {}", e.without_url()))?;

    if let Some(errcode) = resp.get("errcode").and_then(|v| v.as_i64()) {
        if errcode != 0 {
            let errmsg = resp.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
            return Err(format!("WeChat image upload error {}: {}", errcode, errmsg));
        }
    }
    resp.get("url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No url in WeChat image upload response: {}", resp))
}

pub(crate) async fn wechat_upload_thumb(
    client: &reqwest::Client,
    token: &str,
    path: &Path,
) -> Result<String, String> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Cannot read cover image {}: {}", path.display(), e))?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("cover.jpg")
        .to_string();
    let media_part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(wechat_mime_type(path))
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .text("type", "image")
        .part("media", media_part);
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={}&type=image",
        token
    );
    // Same access_token-stripping as wechat_upload_body_image.
    let resp: serde_json::Value = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Cover upload network error: {}", e.without_url()))?
        .json()
        .await
        .map_err(|e| format!("Cover upload parse error: {}", e.without_url()))?;

    if let Some(errcode) = resp.get("errcode").and_then(|v| v.as_i64()) {
        if errcode != 0 {
            let errmsg = resp.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
            return Err(format!("WeChat cover upload error {}: {}", errcode, errmsg));
        }
    }
    resp.get("media_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No media_id in WeChat cover upload response: {}", resp))
}

/// Extract `src` values from `<img src="...">` tags in the HTML string.
pub(crate) fn extract_img_srcs(html: &str) -> Vec<String> {
    let mut srcs = Vec::new();
    let mut search = html;
    while let Some(img_pos) = search.find("<img") {
        search = &search[img_pos + 4..];
        // Find the closing '>' to limit our search
        let tag_end = search.find('>').unwrap_or(search.len());
        let tag_slice = &search[..tag_end];
        if let Some(src_pos) = tag_slice.find("src=\"") {
            let after = &tag_slice[src_pos + 5..];
            if let Some(end) = after.find('"') {
                srcs.push(after[..end].to_string());
            }
        }
    }
    srcs
}

/// Remove the first `<img>` tag whose `src` attribute equals `src` from `html`.
/// Returns the original string unchanged when no matching tag is found.
pub(crate) fn remove_img_tag(html: &str, src: &str) -> String {
    let src_attr = format!("src=\"{}\"", src);
    let mut search_from = 0;
    while let Some(rel_start) = html[search_from..].find("<img") {
        let tag_start = search_from + rel_start;
        let Some(rel_end) = html[tag_start..].find('>') else {
            return html.to_string();
        };
        let tag_end = tag_start + rel_end + 1;
        if html[tag_start..tag_end].contains(&src_attr) {
            return format!("{}{}", &html[..tag_start], &html[tag_end..]);
        }
        search_from = tag_end;
    }
    html.to_string()
}

/// Resolve an asset path relative to `base_dir` and validate it is inside `workspace_root`.
pub(crate) fn resolve_wechat_asset_path(
    workspace_root: &Path,
    base_dir: &Path,
    asset_root: Option<&Path>,
    requested: &str,
) -> Result<PathBuf, String> {
    let candidate = if requested.starts_with('/') {
        // Root-relative web path: resolve against asset_root (public dir) when available,
        // otherwise fall back to workspace_root so /images/foo.jpg → <root>/images/foo.jpg.
        let root = asset_root.unwrap_or(workspace_root);
        root.join(requested.trim_start_matches('/'))
    } else if Path::new(requested).is_absolute() {
        PathBuf::from(requested)
    } else {
        base_dir.join(requested)
    };
    validate_path(workspace_root, &candidate.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── wechat_mime_type ─────────────────────────────────────────────────────

    #[test]
    fn wechat_mime_type_returns_png_for_png() {
        assert_eq!(wechat_mime_type(Path::new("image.png")), "image/png");
    }

    #[test]
    fn wechat_mime_type_returns_gif_for_gif() {
        assert_eq!(wechat_mime_type(Path::new("anim.gif")), "image/gif");
    }

    #[test]
    fn wechat_mime_type_returns_webp_for_webp() {
        assert_eq!(wechat_mime_type(Path::new("photo.webp")), "image/webp");
    }

    #[test]
    fn wechat_mime_type_defaults_to_jpeg_for_jpg() {
        assert_eq!(wechat_mime_type(Path::new("photo.jpg")), "image/jpeg");
    }

    #[test]
    fn wechat_mime_type_defaults_to_jpeg_for_unknown() {
        assert_eq!(wechat_mime_type(Path::new("photo.bmp")), "image/jpeg");
    }

    #[test]
    fn wechat_mime_type_is_case_insensitive() {
        assert_eq!(wechat_mime_type(Path::new("image.PNG")), "image/png");
    }

    // ── extract_img_srcs ─────────────────────────────────────────────────────

    #[test]
    fn extract_img_srcs_returns_empty_for_no_images() {
        assert_eq!(extract_img_srcs("<p>hello</p>"), Vec::<String>::new());
    }

    #[test]
    fn extract_img_srcs_finds_single_src() {
        let srcs = extract_img_srcs(r#"<img src="https://cdn.example.com/a.jpg">"#);
        assert_eq!(srcs, vec!["https://cdn.example.com/a.jpg"]);
    }

    #[test]
    fn extract_img_srcs_finds_multiple_srcs() {
        let html = r#"<img src="a.png"><p>text</p><img src="b.jpg">"#;
        assert_eq!(extract_img_srcs(html), vec!["a.png", "b.jpg"]);
    }

    #[test]
    fn extract_img_srcs_skips_img_without_src() {
        let html = r#"<img alt="no src"><img src="real.png">"#;
        assert_eq!(extract_img_srcs(html), vec!["real.png"]);
    }

    #[test]
    fn extract_img_srcs_handles_inline_img() {
        let html = r#"<p>before <img src="inline.png" style="max-width:100%"> after</p>"#;
        assert_eq!(extract_img_srcs(html), vec!["inline.png"]);
    }

    // ── resolve_wechat_asset_path ────────────────────────────────────────────

    #[test]
    fn resolve_wechat_asset_path_relative_path_joins_base_dir() {
        let dir = TempDir::new().unwrap();
        let img = dir.path().join("images").join("cover.jpg");
        fs::create_dir_all(img.parent().unwrap()).unwrap();
        fs::write(&img, b"").unwrap();

        let result = resolve_wechat_asset_path(
            dir.path(),
            dir.path(),
            None,
            "images/cover.jpg",
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), img.canonicalize().unwrap());
    }

    #[test]
    fn resolve_wechat_asset_path_root_relative_uses_asset_root() {
        let dir = TempDir::new().unwrap();
        let public = dir.path().join("public");
        let img = public.join("images").join("hero.jpg");
        fs::create_dir_all(img.parent().unwrap()).unwrap();
        fs::write(&img, b"").unwrap();

        let result = resolve_wechat_asset_path(
            dir.path(),
            dir.path(),
            Some(&public),
            "/images/hero.jpg",
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), img.canonicalize().unwrap());
    }

    #[test]
    fn resolve_wechat_asset_path_root_relative_falls_back_to_workspace_root() {
        let dir = TempDir::new().unwrap();
        let img = dir.path().join("images").join("hero.jpg");
        fs::create_dir_all(img.parent().unwrap()).unwrap();
        fs::write(&img, b"").unwrap();

        let result = resolve_wechat_asset_path(
            dir.path(),
            dir.path(),
            None,
            "/images/hero.jpg",
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), img.canonicalize().unwrap());
    }

    #[test]
    fn resolve_wechat_asset_path_rejects_path_outside_workspace() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let img = outside.path().join("secret.jpg");
        fs::write(&img, b"").unwrap();

        let result = resolve_wechat_asset_path(
            dir.path(),
            dir.path(),
            None,
            &img.to_string_lossy(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn resolve_wechat_asset_path_returns_err_when_file_not_found() {
        let dir = TempDir::new().unwrap();
        let result = resolve_wechat_asset_path(
            dir.path(),
            dir.path(),
            None,
            "nonexistent/image.jpg",
        );
        assert!(result.is_err());
    }
}
