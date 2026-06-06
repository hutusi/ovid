// Items here are wired up by `git::commands` in the next commit on this branch;
// the module-level allow keeps the staging commit warning-clean.
#![allow(dead_code)]

use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use url::Url;

// RFC 3986 userinfo allows alphanumerics + a small unreserved set; everything
// else (notably `@`, `:`, `/`, `?`, `#`, `%`) must be percent-encoded so it
// can't be misread as a URL delimiter. Personal access tokens routinely
// contain `_` and `-` (both unreserved); some hosts emit tokens with `+` or
// `=`, which we encode to be safe.
const USERINFO_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'<')
    .add(b'>')
    .add(b'`')
    .add(b'?')
    .add(b'{')
    .add(b'}')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'=')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'|')
    .add(b'%')
    .add(b'+')
    .add(b'&');

fn encode_userinfo(value: &str) -> String {
    utf8_percent_encode(value, USERINFO_ENCODE_SET).to_string()
}

/// Return the host of an HTTPS/HTTP remote URL, suitable for keying the
/// credential store. Returns `None` for SSH (`git@host:path`), file paths,
/// or any other scheme that doesn't carry HTTP Basic auth.
pub(crate) fn host_for_remote_url(remote_url: &str) -> Option<String> {
    let parsed = Url::parse(remote_url.trim()).ok()?;
    match parsed.scheme() {
        "http" | "https" => parsed.host_str().map(str::to_string),
        _ => None,
    }
}

/// Build a credential-injected URL suitable for passing as the remote argument
/// of `git push|pull|fetch`. Username and password are percent-encoded so that
/// PATs with special characters round-trip correctly.
///
/// Returns `Err` for non-HTTP(S) URLs — SSH remotes don't use HTTP Basic auth,
/// so the caller should not attempt the credential retry for them.
pub(crate) fn inject_credentials(
    remote_url: &str,
    username: &str,
    password: &str,
) -> Result<String, String> {
    let mut parsed = Url::parse(remote_url.trim())
        .map_err(|e| format!("could not parse remote URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("unsupported URL scheme for credential injection: {other}")),
    }
    // `url::Url::set_username` / `set_password` percent-encode internally, but
    // their encode set is narrower than what real-world PATs need (it leaves
    // `@`, `:`, `+`, etc. as-is). Pre-encode and assign the raw value so we
    // control the encoding.
    let encoded_user = encode_userinfo(username);
    let encoded_pw = encode_userinfo(password);
    parsed
        .set_username(&encoded_user)
        .map_err(|_| "could not set username on URL (no host?)".to_string())?;
    parsed
        .set_password(Some(&encoded_pw))
        .map_err(|_| "could not set password on URL (no host?)".to_string())?;
    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_for_remote_url_returns_https_host() {
        assert_eq!(
            host_for_remote_url("https://github.com/hutusi/ovid.git").as_deref(),
            Some("github.com")
        );
    }

    #[test]
    fn host_for_remote_url_returns_http_host() {
        assert_eq!(
            host_for_remote_url("http://internal.example/repo.git").as_deref(),
            Some("internal.example")
        );
    }

    #[test]
    fn host_for_remote_url_returns_none_for_ssh_remote() {
        // SSH remotes (`git@github.com:user/repo.git`) parse as `git:` scheme
        // when run through Url::parse, but we filter to http/https anyway.
        assert!(host_for_remote_url("git@github.com:hutusi/ovid.git").is_none());
    }

    #[test]
    fn host_for_remote_url_returns_none_for_ssh_scheme() {
        assert!(host_for_remote_url("ssh://git@github.com/hutusi/ovid.git").is_none());
    }

    #[test]
    fn host_for_remote_url_returns_none_for_garbage() {
        assert!(host_for_remote_url("not a url at all").is_none());
    }

    #[test]
    fn host_for_remote_url_trims_whitespace() {
        assert_eq!(
            host_for_remote_url("  https://gitlab.com/foo/bar  ").as_deref(),
            Some("gitlab.com")
        );
    }

    #[test]
    fn inject_credentials_basic_https() {
        let out = inject_credentials("https://github.com/hutusi/ovid.git", "alice", "secret")
            .unwrap();
        assert_eq!(out, "https://alice:secret@github.com/hutusi/ovid.git");
    }

    #[test]
    fn inject_credentials_basic_http() {
        let out = inject_credentials("http://internal.example/repo.git", "alice", "secret")
            .unwrap();
        assert_eq!(out, "http://alice:secret@internal.example/repo.git");
    }

    #[test]
    fn inject_credentials_encodes_password_with_at_sign() {
        let out =
            inject_credentials("https://github.com/foo/bar.git", "alice", "p@ss").unwrap();
        assert_eq!(out, "https://alice:p%40ss@github.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_encodes_password_with_colon_and_slash() {
        let out = inject_credentials("https://github.com/foo/bar.git", "alice", "a:b/c")
            .unwrap();
        assert_eq!(out, "https://alice:a%3Ab%2Fc@github.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_encodes_password_with_hash_and_query() {
        // `#` and `?` would otherwise terminate the URL path early.
        let out =
            inject_credentials("https://github.com/foo/bar.git", "alice", "x#y?z").unwrap();
        assert_eq!(out, "https://alice:x%23y%3Fz@github.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_encodes_percent_sign_in_password() {
        // Avoid double-decoding: literal `%` becomes `%25`.
        let out = inject_credentials("https://github.com/foo/bar.git", "alice", "50%off")
            .unwrap();
        assert_eq!(out, "https://alice:50%25off@github.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_encodes_plus_in_password() {
        let out =
            inject_credentials("https://github.com/foo/bar.git", "alice", "a+b").unwrap();
        assert_eq!(out, "https://alice:a%2Bb@github.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_encodes_username_with_at_sign() {
        // Email-style usernames are common on some forges.
        let out =
            inject_credentials("https://gitlab.com/foo/bar.git", "alice@host", "pw").unwrap();
        assert_eq!(out, "https://alice%40host:pw@gitlab.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_preserves_port_and_path() {
        let out =
            inject_credentials("https://forge.local:8443/team/repo.git", "alice", "pw").unwrap();
        assert_eq!(out, "https://alice:pw@forge.local:8443/team/repo.git");
    }

    #[test]
    fn inject_credentials_overwrites_existing_credentials() {
        // If the URL already has creds (it shouldn't, but defensively), they
        // are replaced with the supplied ones.
        let out = inject_credentials(
            "https://oldUser:oldPass@github.com/foo/bar.git",
            "alice",
            "newPass",
        )
        .unwrap();
        assert_eq!(out, "https://alice:newPass@github.com/foo/bar.git");
    }

    #[test]
    fn inject_credentials_rejects_ssh_scheme() {
        let err = inject_credentials("ssh://git@github.com/foo/bar.git", "alice", "pw")
            .expect_err("ssh should be rejected");
        assert!(err.contains("unsupported"));
    }

    #[test]
    fn inject_credentials_rejects_git_at_ssh_shorthand() {
        // `git@host:path` doesn't parse as a URL with a scheme — it should
        // surface as an error so the caller doesn't accidentally retry.
        assert!(inject_credentials("git@github.com:foo/bar.git", "alice", "pw").is_err());
    }

    #[test]
    fn inject_credentials_rejects_garbage() {
        assert!(inject_credentials("not a url", "alice", "pw").is_err());
    }

    #[test]
    fn inject_credentials_accepts_empty_password() {
        // Edge case: empty password is allowed (e.g. token-as-user style).
        // `url` normalises `user:@host` to `user@host` — both are valid HTTP
        // Basic auth syntax that git accepts.
        let out =
            inject_credentials("https://github.com/foo/bar.git", "ghs_token", "").unwrap();
        assert_eq!(out, "https://ghs_token@github.com/foo/bar.git");
    }
}
