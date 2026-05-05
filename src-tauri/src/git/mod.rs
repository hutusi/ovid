use serde::Serialize;

pub(crate) mod args;
pub(crate) mod classify;
pub(crate) mod commands;
pub(crate) mod parse;
pub(crate) mod runner;

// ── Git integration ────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitFileStatus {
    pub(crate) path: String,
    pub(crate) status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommitChange {
    pub(crate) path: String,
    pub(crate) display_path: String,
    pub(crate) status: String,
    pub(crate) staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitBranch {
    pub(crate) name: String,
    pub(crate) upstream: Option<String>,
    pub(crate) ahead_behind: Option<String>,
    pub(crate) is_current: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRemoteBranch {
    pub(crate) name: String,
    pub(crate) remote_name: String,
    pub(crate) remote_ref: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRemote {
    pub(crate) name: String,
    pub(crate) url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRemoteInfo {
    pub(crate) remotes: Vec<GitRemote>,
    pub(crate) remote_name: Option<String>,
    pub(crate) remote_url: Option<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) ahead_behind: Option<String>,
}
