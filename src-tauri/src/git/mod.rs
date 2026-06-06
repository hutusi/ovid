use serde::Serialize;
use ts_rs::TS;

pub(crate) mod args;
pub(crate) mod classify;
pub(crate) mod commands;
pub(crate) mod creds;
pub(crate) mod parse;
pub(crate) mod runner;
pub(crate) mod url_auth;

// ── Git integration ────────────────────────────────────────────────────────

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct GitFileStatus {
    pub(crate) path: String,
    pub(crate) status: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct GitCommitChange {
    pub(crate) path: String,
    pub(crate) display_path: String,
    pub(crate) status: String,
    pub(crate) staged: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct GitBranch {
    pub(crate) name: String,
    pub(crate) upstream: Option<String>,
    pub(crate) ahead_behind: Option<String>,
    pub(crate) is_current: bool,
}

#[derive(Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct GitRemoteBranch {
    pub(crate) name: String,
    pub(crate) remote_name: String,
    pub(crate) remote_ref: String,
}

#[derive(Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct GitRemote {
    pub(crate) name: String,
    pub(crate) url: Option<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct GitRemoteInfo {
    pub(crate) remotes: Vec<GitRemote>,
    pub(crate) remote_name: Option<String>,
    pub(crate) remote_url: Option<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) ahead_behind: Option<String>,
}
