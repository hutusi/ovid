// Structured marker the frontend matches on to open the credentials dialog.
// Format: `AUTH_REQUIRED|<host>|<remote_name>`. Either field can be empty if
// it could not be resolved at the time of the failure — the frontend treats
// both as advisory and still opens the dialog.
pub(crate) const AUTH_REQUIRED_PREFIX: &str = "AUTH_REQUIRED|";

pub(crate) fn auth_required_marker(host: Option<&str>, remote_name: Option<&str>) -> String {
    format!(
        "{prefix}{host}|{remote}",
        prefix = AUTH_REQUIRED_PREFIX,
        host = host.unwrap_or(""),
        remote = remote_name.unwrap_or(""),
    )
}

pub(crate) fn is_auth_failure(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("permission denied")
        || lower.contains("repository not found")
        || lower.contains("invalid username or password")
}

fn is_transport_only_failure(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("connection timed out")
}

pub(crate) fn classify_git_push_error(
    stderr: &str,
    host: Option<&str>,
    remote_name: Option<&str>,
) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("non-fast-forward")
        || lower.contains("[rejected]")
        || lower.contains("fetch first")
    {
        return "Push rejected. Remote has new commits. Pull or fetch first.".to_string();
    }
    if is_auth_failure(stderr) {
        return auth_required_marker(host, remote_name);
    }
    if is_transport_only_failure(stderr) {
        return "Push failed because the remote could not be reached or authorized.".to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_pull_error(
    stderr: &str,
    host: Option<&str>,
    remote_name: Option<&str>,
) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("not possible to fast-forward") || lower.contains("cannot fast-forward") {
        return "Pull stopped because the branch cannot be fast-forwarded. Resolve it in Git, then refresh.".to_string();
    }
    if lower.contains("would be overwritten by merge") || lower.contains("local changes") {
        return "Pull blocked by local changes. Commit, stash, or discard changes first."
            .to_string();
    }
    if lower.contains("conflict") {
        return "Pull stopped because of conflicts. Resolve them in Git, then refresh.".to_string();
    }
    if is_auth_failure(stderr) {
        return auth_required_marker(host, remote_name);
    }
    if is_transport_only_failure(stderr) {
        return "Pull failed because the remote could not be reached or authorized.".to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_fetch_error(
    stderr: &str,
    host: Option<&str>,
    remote_name: Option<&str>,
) -> String {
    if is_auth_failure(stderr) {
        return auth_required_marker(host, remote_name);
    }
    if is_transport_only_failure(stderr) {
        return "Fetch failed because the remote could not be reached.".to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_branch_delete_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("not fully merged") {
        return "Delete stopped because the branch has unmerged commits. Merge it first or use Git CLI to force delete.".to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_switch_branch_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("invalid reference") {
        return "Switch failed because that branch no longer exists. Refresh and try again."
            .to_string();
    }
    if lower.contains("would be overwritten by checkout") {
        return "Switch blocked by local changes. Commit, stash, or discard changes first."
            .to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_create_branch_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("already exists") {
        return "Create failed because a branch with that name already exists.".to_string();
    }
    if lower.contains("not a valid branch name") {
        return "Create failed because that name isn't a valid branch name.".to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_rename_branch_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("already exists") {
        return "Rename failed because a branch with that name already exists.".to_string();
    }
    stderr.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_required_marker_includes_host_and_remote() {
        assert_eq!(
            auth_required_marker(Some("github.com"), Some("origin")),
            "AUTH_REQUIRED|github.com|origin"
        );
    }

    #[test]
    fn auth_required_marker_allows_unknown_fields() {
        assert_eq!(auth_required_marker(None, None), "AUTH_REQUIRED||");
        assert_eq!(
            auth_required_marker(Some("github.com"), None),
            "AUTH_REQUIRED|github.com|"
        );
    }

    #[test]
    fn classify_git_push_error_detects_non_fast_forward() {
        let stderr =
            "! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs";
        assert_eq!(
            classify_git_push_error(stderr, Some("github.com"), Some("origin")),
            "Push rejected. Remote has new commits. Pull or fetch first."
        );
    }

    #[test]
    fn classify_git_push_error_returns_auth_marker_on_authentication_failure() {
        let stderr = "fatal: Authentication failed for 'https://github.com/hutusi/ovid.git/'";
        assert_eq!(
            classify_git_push_error(stderr, Some("github.com"), Some("origin")),
            "AUTH_REQUIRED|github.com|origin"
        );
    }

    #[test]
    fn classify_git_push_error_returns_auth_marker_when_username_missing() {
        let stderr = "fatal: could not read Username for 'https://github.com': terminal prompts disabled";
        assert_eq!(
            classify_git_push_error(stderr, Some("github.com"), Some("origin")),
            "AUTH_REQUIRED|github.com|origin"
        );
    }

    #[test]
    fn classify_git_push_error_keeps_transport_message_for_network_failures() {
        let stderr = "fatal: unable to access 'https://github.com/foo/bar.git/': Could not resolve host: github.com";
        assert_eq!(
            classify_git_push_error(stderr, Some("github.com"), Some("origin")),
            "Push failed because the remote could not be reached or authorized."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_fast_forward_stop() {
        let stderr = "fatal: Not possible to fast-forward, aborting.";
        assert_eq!(
            classify_git_pull_error(stderr, None, None),
            "Pull stopped because the branch cannot be fast-forwarded. Resolve it in Git, then refresh."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_local_changes_blocking_pull() {
        let stderr =
            "error: Your local changes to the following files would be overwritten by merge:";
        assert_eq!(
            classify_git_pull_error(stderr, None, None),
            "Pull blocked by local changes. Commit, stash, or discard changes first."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_conflicts() {
        let stderr = "CONFLICT (content): Merge conflict in notes/draft.md";
        assert_eq!(
            classify_git_pull_error(stderr, None, None),
            "Pull stopped because of conflicts. Resolve them in Git, then refresh."
        );
    }

    #[test]
    fn classify_git_pull_error_returns_auth_marker_on_authentication_failure() {
        let stderr = "fatal: Authentication failed for 'https://gitlab.com/foo/bar.git/'";
        assert_eq!(
            classify_git_pull_error(stderr, Some("gitlab.com"), Some("origin")),
            "AUTH_REQUIRED|gitlab.com|origin"
        );
    }

    #[test]
    fn classify_git_fetch_error_returns_auth_marker_on_authentication_failure() {
        let stderr = "fatal: Authentication failed for 'https://github.com/foo/bar.git/'";
        assert_eq!(
            classify_git_fetch_error(stderr, Some("github.com"), Some("upstream")),
            "AUTH_REQUIRED|github.com|upstream"
        );
    }

    #[test]
    fn classify_git_fetch_error_keeps_transport_message_for_network_failures() {
        let stderr = "fatal: unable to access 'https://github.com/foo/bar.git/': Could not resolve host";
        assert_eq!(
            classify_git_fetch_error(stderr, Some("github.com"), Some("origin")),
            "Fetch failed because the remote could not be reached."
        );
    }

    #[test]
    fn classify_git_branch_delete_error_detects_unmerged_branch() {
        let stderr = "error: The branch 'feature/test' is not fully merged.";
        assert_eq!(
            classify_git_branch_delete_error(stderr),
            "Delete stopped because the branch has unmerged commits. Merge it first or use Git CLI to force delete."
        );
    }

    // Sample stderr for the following tests was captured from real git runs,
    // not guessed — see the commit message for the exact commands used.

    #[test]
    fn classify_git_switch_branch_error_detects_missing_branch() {
        let stderr = "fatal: invalid reference: does-not-exist";
        assert_eq!(
            classify_git_switch_branch_error(stderr),
            "Switch failed because that branch no longer exists. Refresh and try again."
        );
    }

    #[test]
    fn classify_git_switch_branch_error_detects_local_changes_blocking_switch() {
        let stderr = "error: Your local changes to the following files would be overwritten by checkout:\n\ttracked.txt\nPlease commit your changes or stash them before you switch branches.\nAborting";
        assert_eq!(
            classify_git_switch_branch_error(stderr),
            "Switch blocked by local changes. Commit, stash, or discard changes first."
        );
    }

    #[test]
    fn classify_git_switch_branch_error_falls_back_to_raw_stderr() {
        let stderr = "fatal: some unrecognized failure";
        assert_eq!(classify_git_switch_branch_error(stderr), stderr);
    }

    #[test]
    fn classify_git_create_branch_error_detects_existing_branch() {
        let stderr = "fatal: a branch named 'existing-branch' already exists";
        assert_eq!(
            classify_git_create_branch_error(stderr),
            "Create failed because a branch with that name already exists."
        );
    }

    #[test]
    fn classify_git_create_branch_error_detects_invalid_name() {
        let stderr = "fatal: '-foo' is not a valid branch name";
        assert_eq!(
            classify_git_create_branch_error(stderr),
            "Create failed because that name isn't a valid branch name."
        );
    }

    #[test]
    fn classify_git_rename_branch_error_detects_existing_branch() {
        let stderr = "fatal: a branch named 'existing-branch' already exists";
        assert_eq!(
            classify_git_rename_branch_error(stderr),
            "Rename failed because a branch with that name already exists."
        );
    }

    #[test]
    fn classify_git_rename_branch_error_falls_back_to_raw_stderr() {
        let stderr = "fatal: some unrecognized failure";
        assert_eq!(classify_git_rename_branch_error(stderr), stderr);
    }
}
