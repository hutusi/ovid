use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Instant, SystemTime};

// Holds workspace paths so file commands can validate against them.
pub(crate) struct WorkspaceState {
    pub(crate) tree_root: Mutex<Option<PathBuf>>,
    pub(crate) workspace_root: Mutex<Option<PathBuf>>,
    // TODO: add bounded eviction or explicit workspace/session clears if cache
    // growth becomes a measured memory issue in long-running large-workspace sessions.
    pub(crate) frontmatter_cache: Mutex<HashMap<PathBuf, CachedFrontmatter>>,
    pub(crate) search_cache: Mutex<HashMap<PathBuf, CachedSearchFile>>,
}

// Caches the WeChat access token so we don't refetch it on every publish.
pub(crate) struct WechatState {
    pub(crate) token_cache: Mutex<Option<WechatTokenCache>>,
}

pub(crate) struct WechatTokenCache {
    pub(crate) app_id: String,
    pub(crate) access_token: String,
    pub(crate) expires_at: Instant,
}

#[derive(Serialize)]
pub(crate) struct WechatCredStatus {
    pub(crate) app_id: Option<String>,
    pub(crate) has_secret: bool,
}

#[derive(Serialize)]
pub(crate) struct WechatPublishResult {
    pub(crate) media_id: String,
    pub(crate) updated: bool,
}

#[derive(Serialize, Clone)]
pub(crate) struct WechatUploadProgress {
    pub(crate) current: usize,
    pub(crate) total: usize,
}

#[derive(Clone)]
pub(crate) struct CachedFrontmatter {
    pub(crate) modified: Option<SystemTime>,
    pub(crate) len: u64,
    pub(crate) title: Option<String>,
    pub(crate) draft: Option<bool>,
    pub(crate) content_type: Option<String>,
}

#[derive(Clone)]
pub(crate) struct CachedSearchFile {
    pub(crate) modified: Option<SystemTime>,
    pub(crate) len: u64,
    pub(crate) title: Option<String>,
    pub(crate) draft: bool,
    pub(crate) lines: Vec<String>,
}
