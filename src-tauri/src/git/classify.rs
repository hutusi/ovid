pub(crate) fn is_git_transport_error(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("permission denied")
        || lower.contains("repository not found")
        || lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("connection timed out")
}

pub(crate) fn classify_git_push_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("non-fast-forward")
        || lower.contains("[rejected]")
        || lower.contains("fetch first")
    {
        return "Push rejected. Remote has new commits. Pull or fetch first.".to_string();
    }
    if is_git_transport_error(stderr) {
        return "Push failed because the remote could not be reached or authorized.".to_string();
    }
    stderr.to_string()
}

pub(crate) fn classify_git_pull_error(stderr: &str) -> String {
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
    if is_git_transport_error(stderr) {
        return "Pull failed because the remote could not be reached or authorized.".to_string();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_git_push_error_detects_non_fast_forward() {
        let stderr =
            "! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs";
        assert_eq!(
            classify_git_push_error(stderr),
            "Push rejected. Remote has new commits. Pull or fetch first."
        );
    }

    #[test]
    fn classify_git_push_error_detects_transport_failure() {
        let stderr = "fatal: Authentication failed for 'https://github.com/hutusi/ovid.git/'";
        assert_eq!(
            classify_git_push_error(stderr),
            "Push failed because the remote could not be reached or authorized."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_fast_forward_stop() {
        let stderr = "fatal: Not possible to fast-forward, aborting.";
        assert_eq!(
            classify_git_pull_error(stderr),
            "Pull stopped because the branch cannot be fast-forwarded. Resolve it in Git, then refresh."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_local_changes_blocking_pull() {
        let stderr =
            "error: Your local changes to the following files would be overwritten by merge:";
        assert_eq!(
            classify_git_pull_error(stderr),
            "Pull blocked by local changes. Commit, stash, or discard changes first."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_conflicts() {
        let stderr = "CONFLICT (content): Merge conflict in notes/draft.md";
        assert_eq!(
            classify_git_pull_error(stderr),
            "Pull stopped because of conflicts. Resolve them in Git, then refresh."
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
}
