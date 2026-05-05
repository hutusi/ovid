use std::path::{Path, PathBuf};

use crate::paths::{normalize_path, validate_path};

use super::runner::run_git;
use super::{GitBranch, GitCommitChange, GitRemote, GitRemoteBranch, GitRemoteInfo};

pub(crate) fn validate_git_commit_path(workspace_root: &Path, requested: &str) -> Result<String, String> {
    let requested_path = Path::new(requested);
    if requested.trim().is_empty() {
        return Err("commit path cannot be empty".to_string());
    }
    if requested_path.is_absolute() {
        return Err("commit path must be relative to the opened workspace".to_string());
    }

    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let candidate = canonical_root.join(requested_path);
    if candidate.exists() {
        validate_path(&canonical_root, &candidate.to_string_lossy())?;
    } else {
        let normalized = normalize_path(&candidate);
        if !normalized.starts_with(&canonical_root) {
            return Err("path is outside the opened workspace".to_string());
        }
    }

    Ok(requested.to_string())
}

pub(crate) fn validate_git_commit_selection(
    git_root: &Path,
    workspace_root: &Path,
    requested: &str,
) -> Result<String, String> {
    validate_git_commit_path(git_root, requested)?;

    let git_root_canonical =
        std::fs::canonicalize(git_root).map_err(|e| format!("git root: {e}"))?;
    let workspace_root_canonical =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let candidate = git_root_canonical.join(requested);

    let target = if candidate.exists() {
        std::fs::canonicalize(&candidate).map_err(|e| format!("commit path: {e}"))?
    } else {
        normalize_path(&candidate)
    };

    if !target.starts_with(&workspace_root_canonical) {
        return Err("path is outside the opened workspace".to_string());
    }

    Ok(requested.to_string())
}

pub(crate) fn parse_git_status_output(git_root: &str, porcelain: &str) -> Vec<GitCommitChange> {
    let mut changes = Vec::new();
    let mut records = porcelain.split('\0').filter(|record| !record.is_empty());

    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let xy = &record[..2];
        let path_part = &record[3..];
        let index_status = xy.chars().next().unwrap_or(' ');
        let worktree_status = xy.chars().nth(1).unwrap_or(' ');
        // For renames/copies, porcelain v1 -z emits `XY <DEST>\0<SRC>\0` —
        // destination path first, source path second. Consume the source so it
        // does not pollute the next iteration, and keep the destination for
        // display/staging.
        if matches!(index_status, 'R' | 'C') || matches!(worktree_status, 'R' | 'C') {
            let _ = records.next();
        }
        let file_path = path_part;
        let staged = index_status != ' ' && index_status != '?';
        let status = if xy.starts_with('?') {
            "untracked"
        } else if index_status == 'D' || worktree_status == 'D' {
            "deleted"
        } else if matches!(index_status, 'R' | 'C') || matches!(worktree_status, 'R' | 'C') {
            "renamed"
        } else if index_status == 'A' {
            "added"
        } else if staged {
            "staged"
        } else {
            "modified"
        };

        changes.push(GitCommitChange {
            path: PathBuf::from(git_root)
                .join(file_path)
                .to_string_lossy()
                .into_owned(),
            display_path: file_path.to_string(),
            status: status.to_string(),
            staged,
        });
    }

    changes
}

pub(crate) fn parse_git_status(git_root: &str) -> Result<Vec<GitCommitChange>, String> {
    let porcelain = run_git(git_root, &["status", "--porcelain=v1", "-z"])?;
    Ok(parse_git_status_output(git_root, &porcelain))
}

pub(crate) fn parse_git_branches(git_root: &str) -> Result<Vec<GitBranch>, String> {
    let refs = run_git(
        git_root,
        &[
            "for-each-ref",
            "--format=%(refname:short)\t%(upstream:short)\t%(upstream:trackshort)\t%(HEAD)",
            "refs/heads",
        ],
    )?;

    Ok(parse_git_branch_lines(&refs))
}

pub(crate) fn parse_git_branch_lines(refs: &str) -> Vec<GitBranch> {
    let mut branches = Vec::new();
    for line in refs.lines() {
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let upstream = parts.next().map(str::trim).filter(|s| !s.is_empty());
        let ahead_behind = parts.next().map(str::trim).filter(|s| !s.is_empty());
        let head = parts.next().unwrap_or("").trim();
        branches.push(GitBranch {
            name: name.to_string(),
            upstream: upstream.map(ToString::to_string),
            ahead_behind: ahead_behind.map(ToString::to_string),
            is_current: head == "*",
        });
    }

    branches.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    branches
}

pub(crate) fn parse_git_remote_branch_lines(refs: &str) -> Vec<GitRemoteBranch> {
    let mut branches = Vec::new();
    for line in refs.lines() {
        let remote_ref = line.trim();
        if remote_ref.is_empty() || remote_ref.ends_with("/HEAD") {
            continue;
        }
        let Some((remote_name, branch_name)) = remote_ref.split_once('/') else {
            continue;
        };
        if branch_name.trim().is_empty() {
            continue;
        }
        branches.push(GitRemoteBranch {
            name: branch_name.to_string(),
            remote_name: remote_name.to_string(),
            remote_ref: remote_ref.to_string(),
        });
    }

    branches.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.remote_name.cmp(&b.remote_name))
    });
    branches
}

pub(crate) fn parse_git_remote_branches(git_root: &str) -> Result<Vec<GitRemoteBranch>, String> {
    let refs = run_git(
        git_root,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )?;

    Ok(parse_git_remote_branch_lines(&refs))
}

pub(crate) fn parse_remote_name(upstream: &str) -> Option<String> {
    upstream
        .split('/')
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

pub(crate) fn get_git_remotes(git_root: &str) -> Result<Vec<GitRemote>, String> {
    let output = run_git(git_root, &["remote"])?;
    let mut remotes = output
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| GitRemote {
            name: name.to_string(),
            url: run_git(git_root, &["remote", "get-url", name])
                .ok()
                .and_then(|url| normalize_remote_url(url.trim()))
                .filter(|url| !url.is_empty()),
        })
        .collect::<Vec<_>>();
    remotes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(remotes)
}

pub(crate) fn get_git_config_value(git_root: &str, key: &str) -> Option<String> {
    run_git(git_root, &["config", "--get", key])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn get_preferred_remote_name(
    git_root: &str,
    current_branch: &GitBranch,
    remotes: &[GitRemote],
) -> Option<String> {
    let is_known_remote = |name: &str| remotes.iter().any(|remote| remote.name == name);

    if let Some(name) = current_branch
        .upstream
        .as_deref()
        .and_then(parse_remote_name)
        .filter(|name| is_known_remote(name))
    {
        return Some(name);
    }

    if let Some(name) = get_git_config_value(
        git_root,
        &format!("branch.{}.pushRemote", current_branch.name),
    )
    .filter(|name| is_known_remote(name))
    {
        return Some(name);
    }

    if let Some(name) =
        get_git_config_value(git_root, "remote.pushDefault").filter(|name| is_known_remote(name))
    {
        return Some(name);
    }

    if remotes.len() == 1 {
        return remotes.first().map(|remote| remote.name.clone());
    }

    None
}

pub(crate) fn normalize_remote_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let (scheme, rest) = trimmed.split_once("://")?;
        let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
        let sanitized_authority = authority
            .rsplit_once('@')
            .map(|(_, host)| host)
            .unwrap_or(authority);
        let sanitized = if path.is_empty() {
            format!("{scheme}://{sanitized_authority}")
        } else {
            format!("{scheme}://{sanitized_authority}/{path}")
        };
        return Some(sanitized.trim_end_matches(".git").to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        return Some(format!(
            "https://{}/{}",
            host,
            path.trim_end_matches(".git")
        ));
    }
    if let Some(rest) = trimmed.strip_prefix("ssh://git@") {
        let (host, path) = rest.split_once('/')?;
        return Some(format!(
            "https://{}/{}",
            host,
            path.trim_end_matches(".git")
        ));
    }
    None
}

pub(crate) fn get_git_remote_info_inner(git_root: &str) -> Result<GitRemoteInfo, String> {
    let branches = parse_git_branches(git_root)?;
    let current = branches.iter().find(|branch| branch.is_current);
    let remotes = get_git_remotes(git_root)?;
    let remote_name =
        current.and_then(|branch| get_preferred_remote_name(git_root, branch, &remotes));
    let remote_url = remote_name.as_deref().and_then(|name| {
        remotes
            .iter()
            .find(|remote| remote.name == name)
            .and_then(|remote| remote.url.clone())
    });

    Ok(GitRemoteInfo {
        remotes,
        remote_name,
        remote_url,
        upstream: current.and_then(|branch| branch.upstream.clone()),
        ahead_behind: current.and_then(|branch| branch.ahead_behind.clone()),
    })
}

pub(crate) fn get_current_branch_inner(git_root: &str) -> Result<String, String> {
    run_git(git_root, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

pub(crate) fn validate_git_branch_rename(
    old_branch: &str,
    new_branch: &str,
) -> Result<(String, String), String> {
    let old_branch = old_branch.trim();
    let new_branch = new_branch.trim();
    if old_branch.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    if new_branch.is_empty() {
        return Err("new branch name cannot be empty".to_string());
    }
    if old_branch == new_branch {
        return Err("branch name is unchanged".to_string());
    }
    Ok((old_branch.to_string(), new_branch.to_string()))
}

pub(crate) fn validate_git_branch_delete(branches: &[GitBranch], branch_name: &str) -> Result<String, String> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    let Some(branch) = branches.iter().find(|branch| branch.name == branch_name) else {
        return Err("branch is unavailable".to_string());
    };
    if branch.is_current {
        return Err("cannot delete the current branch".to_string());
    }
    Ok(branch_name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{GitBranch, GitRemote};
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn validate_git_branch_rename_rejects_unchanged_name() {
        assert_eq!(
            validate_git_branch_rename("main", "main"),
            Err("branch name is unchanged".to_string())
        );
    }

    #[test]
    fn validate_git_branch_delete_rejects_current_branch() {
        let branches = vec![
            GitBranch {
                name: "main".to_string(),
                upstream: Some("origin/main".to_string()),
                ahead_behind: None,
                is_current: true,
            },
            GitBranch {
                name: "feature/test".to_string(),
                upstream: Some("origin/feature/test".to_string()),
                ahead_behind: None,
                is_current: false,
            },
        ];

        assert_eq!(
            validate_git_branch_delete(&branches, "main"),
            Err("cannot delete the current branch".to_string())
        );
        assert_eq!(
            validate_git_branch_delete(&branches, "feature/test"),
            Ok("feature/test".to_string())
        );
    }

    #[test]
    fn parse_git_branch_lines_marks_current_branch_and_sorts_it_first() {
        let branches = parse_git_branch_lines(
            "feature/test\torigin/feature/test\t>\t \nmain\torigin/main\t<>\t*\n",
        );

        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "main");
        assert!(branches[0].is_current);
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
        assert_eq!(branches[0].ahead_behind.as_deref(), Some("<>"));
        assert_eq!(branches[1].name, "feature/test");
        assert!(!branches[1].is_current);
    }

    #[test]
    fn parse_git_remote_branch_lines_skips_head_and_sorts_by_name() {
        let branches = parse_git_remote_branch_lines(
            "origin/HEAD\norigin/main\nupstream/feature/test\norigin/feature/a\n",
        );

        assert_eq!(branches.len(), 3);
        assert_eq!(branches[0].remote_ref, "origin/feature/a");
        assert_eq!(branches[1].remote_ref, "upstream/feature/test");
        assert_eq!(branches[2].remote_ref, "origin/main");
    }

    #[test]
    fn parse_remote_name_extracts_remote_prefix() {
        assert_eq!(
            parse_remote_name("origin/feature/test"),
            Some("origin".to_string())
        );
    }

    #[test]
    fn normalize_remote_url_handles_https_and_ssh_forms() {
        assert_eq!(
            normalize_remote_url("https://github.com/hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
        assert_eq!(
            normalize_remote_url("https://user:token@github.com/hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
        assert_eq!(
            normalize_remote_url("git@github.com:hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
        assert_eq!(
            normalize_remote_url("ssh://git@github.com/hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
    }

    #[test]
    fn parse_git_status_output_uses_destination_path_for_renames() {
        let git_root = "/repo";
        // `git status --porcelain=v1 -z` emits the destination path first and the
        // source second for renames/copies — verified with `git mv old.md new.md`
        // producing `R  new.md\x00old.md\x00`.
        let changes = parse_git_status_output(git_root, "R  notes/new.md\0notes/old.md\0");

        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].display_path, "notes/new.md");
        assert_eq!(changes[0].status, "renamed");
        assert_eq!(
            changes[0].path,
            std::path::PathBuf::from(git_root)
                .join("notes/new.md")
                .to_string_lossy()
                .into_owned()
        );
    }

    #[test]
    fn parse_git_status_output_preserves_arrow_in_normal_filenames() {
        let git_root = "/repo";
        let changes = parse_git_status_output(git_root, " M notes/A -> B.md\0");

        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].display_path, "notes/A -> B.md");
        assert_eq!(changes[0].status, "modified");
    }

    #[test]
    fn get_preferred_remote_name_prefers_current_branch_upstream() {
        let branch = GitBranch {
            name: "main".to_string(),
            upstream: Some("origin/main".to_string()),
            ahead_behind: None,
            is_current: true,
        };
        let remotes = vec![
            GitRemote {
                name: "origin".to_string(),
                url: None,
            },
            GitRemote {
                name: "publish".to_string(),
                url: None,
            },
        ];

        assert_eq!(
            get_preferred_remote_name("/definitely/not/a/repo", &branch, &remotes),
            Some("origin".to_string())
        );
    }

    #[test]
    fn validate_git_commit_path_allows_existing_relative_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("notes").join("draft.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "# draft").unwrap();

        assert_eq!(
            validate_git_commit_path(dir.path(), "notes/draft.md").unwrap(),
            "notes/draft.md"
        );
    }

    #[test]
    fn validate_git_commit_path_allows_deleted_relative_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("notes").join("deleted.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();

        assert_eq!(
            validate_git_commit_path(dir.path(), "notes/deleted.md").unwrap(),
            "notes/deleted.md"
        );
    }

    #[test]
    fn validate_git_commit_path_rejects_absolute_paths() {
        let dir = TempDir::new().unwrap();
        let absolute = dir.path().join("notes").join("draft.md");

        assert_eq!(
            validate_git_commit_path(dir.path(), &absolute.to_string_lossy()),
            Err("commit path must be relative to the opened workspace".to_string())
        );
    }

    #[test]
    fn validate_git_commit_path_rejects_parent_escape() {
        let dir = TempDir::new().unwrap();

        assert_eq!(
            validate_git_commit_path(dir.path(), "../outside.md"),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[test]
    fn validate_git_commit_selection_rejects_paths_outside_nested_workspace() {
        let dir = TempDir::new().unwrap();
        let git_root = dir.path();
        let workspace_root = git_root.join("apps").join("blog");
        let outside_file = git_root.join("apps").join("admin").join("draft.md");

        fs::create_dir_all(workspace_root.join("posts")).unwrap();
        fs::create_dir_all(outside_file.parent().unwrap()).unwrap();
        fs::write(workspace_root.join("posts").join("entry.md"), "# blog").unwrap();
        fs::write(&outside_file, "# admin").unwrap();

        assert_eq!(
            validate_git_commit_selection(git_root, &workspace_root, "apps/admin/draft.md"),
            Err("path is outside the opened workspace".to_string())
        );
    }
}
