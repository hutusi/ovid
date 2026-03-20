const STANDALONE_IMAGE_RE = /^\s*!\[.*\]\(.*\)\s*$/;
const ATX_HEADING_RE = /^\s{0,3}#{1,6}\s+\S/;

export function normalizeMarkdownSpacing(markdown: string): string {
  const lines = markdown.split("\n");
  const normalized: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = normalized.length > 0 ? normalized[normalized.length - 1] : undefined;

    if (
      prev !== undefined &&
      prev.trim() !== "" &&
      STANDALONE_IMAGE_RE.test(prev) &&
      ATX_HEADING_RE.test(line)
    ) {
      normalized.push("");
    }

    normalized.push(line);
  }

  return normalized.join("\n");
}
