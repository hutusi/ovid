use super::GitRemoteInfo;

pub(crate) fn git_push_args(
    remote: &GitRemoteInfo,
    current_branch: &str,
    explicit_remote_name: Option<&str>,
) -> Result<Vec<String>, String> {
    let explicit_remote_name = explicit_remote_name
        .map(str::trim)
        .filter(|name| !name.is_empty());

    if remote.upstream.is_some() && explicit_remote_name.is_none() {
        return Ok(vec!["push".to_string()]);
    }

    if let Some(name) = explicit_remote_name {
        if !remote
            .remotes
            .iter()
            .any(|configured| configured.name == name)
        {
            return Err("selected remote is no longer configured".to_string());
        }
    }

    let remote_name = explicit_remote_name
        .map(ToString::to_string)
        .or_else(|| remote.remote_name.clone())
        .ok_or_else(|| {
            if remote.remotes.len() > 1 {
                "multiple remotes configured; choose one to set upstream".to_string()
            } else {
                "no remote configured".to_string()
            }
        })?;
    if current_branch.trim().is_empty() {
        return Err("could not determine current branch".to_string());
    }
    Ok(vec![
        "push".to_string(),
        "-u".to_string(),
        remote_name,
        current_branch.to_string(),
    ])
}

pub(crate) fn git_create_branch_args(branch_name: &str) -> Vec<String> {
    vec![
        "switch".to_string(),
        "-c".to_string(),
        branch_name.to_string(),
    ]
}

pub(crate) fn git_rename_branch_args(old_branch: &str, new_branch: &str) -> Vec<String> {
    vec![
        "branch".to_string(),
        "-m".to_string(),
        old_branch.to_string(),
        new_branch.to_string(),
    ]
}

pub(crate) fn git_delete_branch_args(branch_name: &str) -> Vec<String> {
    vec![
        "branch".to_string(),
        "-d".to_string(),
        branch_name.to_string(),
    ]
}

pub(crate) fn git_checkout_remote_branch_args(remote_ref: &str) -> Result<Vec<String>, String> {
    let trimmed = remote_ref.trim();
    let Some((_, branch_name)) = trimmed.split_once('/') else {
        return Err("remote branch must include a remote name".to_string());
    };
    if branch_name.trim().is_empty() {
        return Err("remote branch name cannot be empty".to_string());
    }
    Ok(vec![
        "switch".to_string(),
        "-c".to_string(),
        branch_name.to_string(),
        "--track".to_string(),
        trimmed.to_string(),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{GitRemote, GitRemoteInfo};

    #[test]
    fn git_create_branch_args_use_switch_create_without_ref_separator() {
        assert_eq!(
            git_create_branch_args("test"),
            vec!["switch".to_string(), "-c".to_string(), "test".to_string()]
        );
    }

    #[test]
    fn git_rename_branch_args_use_branch_move() {
        assert_eq!(
            git_rename_branch_args("main", "renamed-main"),
            vec![
                "branch".to_string(),
                "-m".to_string(),
                "main".to_string(),
                "renamed-main".to_string()
            ]
        );
    }

    #[test]
    fn git_delete_branch_args_use_safe_delete() {
        assert_eq!(
            git_delete_branch_args("feature/test"),
            vec![
                "branch".to_string(),
                "-d".to_string(),
                "feature/test".to_string()
            ]
        );
    }

    #[test]
    fn git_checkout_remote_branch_args_track_remote_ref() {
        assert_eq!(
            git_checkout_remote_branch_args("origin/feature/test").unwrap(),
            vec![
                "switch".to_string(),
                "-c".to_string(),
                "feature/test".to_string(),
                "--track".to_string(),
                "origin/feature/test".to_string()
            ]
        );
    }

    #[test]
    fn git_push_args_uses_plain_push_when_upstream_exists() {
        let remote = GitRemoteInfo {
            remotes: vec![GitRemote {
                name: "origin".to_string(),
                url: Some("https://github.com/hutusi/ovid-codex".to_string()),
            }],
            remote_name: Some("origin".to_string()),
            remote_url: Some("https://github.com/hutusi/ovid-codex.git".to_string()),
            upstream: Some("origin/main".to_string()),
            ahead_behind: None,
        };

        assert_eq!(git_push_args(&remote, "main", None).unwrap(), vec!["push"]);
    }

    #[test]
    fn git_push_args_sets_upstream_for_new_branch() {
        let remote = GitRemoteInfo {
            remotes: vec![GitRemote {
                name: "origin".to_string(),
                url: Some("https://github.com/hutusi/ovid-codex".to_string()),
            }],
            remote_name: Some("origin".to_string()),
            remote_url: Some("https://github.com/hutusi/ovid-codex.git".to_string()),
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", None).unwrap(),
            vec!["push", "-u", "origin", "feature/test"]
        );
    }

    #[test]
    fn git_push_args_errors_when_no_remote_exists() {
        let remote = GitRemoteInfo {
            remotes: Vec::new(),
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", None),
            Err("no remote configured".to_string())
        );
    }

    #[test]
    fn git_push_args_requires_explicit_remote_when_multiple_remotes_exist_without_upstream() {
        let remote = GitRemoteInfo {
            remotes: vec![
                GitRemote {
                    name: "origin".to_string(),
                    url: Some("https://github.com/hutusi/ovid-codex".to_string()),
                },
                GitRemote {
                    name: "publish".to_string(),
                    url: Some("https://github.com/example/ovid-codex".to_string()),
                },
            ],
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", None),
            Err("multiple remotes configured; choose one to set upstream".to_string())
        );
        assert_eq!(
            git_push_args(&remote, "feature/test", Some("publish")).unwrap(),
            vec!["push", "-u", "publish", "feature/test"]
        );
    }

    #[test]
    fn git_push_args_errors_when_selected_remote_is_missing() {
        let remote = GitRemoteInfo {
            remotes: vec![GitRemote {
                name: "origin".to_string(),
                url: Some("https://github.com/hutusi/ovid-codex".to_string()),
            }],
            remote_name: Some("origin".to_string()),
            remote_url: Some("https://github.com/hutusi/ovid-codex.git".to_string()),
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", Some("publish")),
            Err("selected remote is no longer configured".to_string())
        );
    }
}
