export const CODE_BLOCK_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "markdown",
  "python",
  "ruby",
  "rust",
  "shell",
  "sql",
  "swift",
  "typescript",
  "xml",
  "yaml",
] as const;

export function normalizeCodeBlockLanguage(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const preset = CODE_BLOCK_LANGUAGES.find((language) => language === trimmed.toLowerCase());
  return preset ?? trimmed;
}

export function isPresetCodeBlockLanguage(value: string | null | undefined): boolean {
  if (!value) return false;
  return CODE_BLOCK_LANGUAGES.includes(value as (typeof CODE_BLOCK_LANGUAGES)[number]);
}
