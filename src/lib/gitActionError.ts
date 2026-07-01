export type GitAction = "push" | "pull" | "fetch";

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatGitActionError(action: GitAction, message: string, t: Translate): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  if (lower.startsWith("push ") || lower.startsWith("pull ") || lower.startsWith("fetch ")) {
    return normalized;
  }
  return t(`errors.git_${action}_failed`, { message: normalized });
}
