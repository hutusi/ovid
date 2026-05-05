pub(crate) fn perf_logging_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var_os("OVID_PERF").is_some()
}

pub(crate) fn log_perf(command: &str, elapsed: std::time::Duration, details: &[(&str, String)]) {
    if !perf_logging_enabled() {
        return;
    }

    let mut message = format!("[perf] {command} took {}ms", elapsed.as_millis());
    if !details.is_empty() {
        let suffix = details
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join(" ");
        message.push(' ');
        message.push_str(&suffix);
    }
    eprintln!("{message}");
}
