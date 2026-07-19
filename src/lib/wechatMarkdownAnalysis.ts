/**
 * Extract a short plain-text excerpt from a Markdown body for the WeChat
 * article digest (maximum 54 characters per the API).
 */
export function extractExcerpt(markdown: string, maxLen = 54): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]{1,2}([^*_~\n]+)[*_~]{1,2}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, maxLen);
  }
  return "";
}

/** DOM-free detection for block or inline LaTeX delimiters. */
export function hasMathBlocks(markdown: string): boolean {
  return /\$\$[\s\S]*?\$\$|\$(?!\d)[^$\n]+\$/.test(markdown);
}

/** Count Markdown images that require upload rather than a remote/protocol URL. */
export function countLocalImages(markdown: string): number {
  let count = 0;
  for (const [, src] of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const url = src.trim().split(/\s+/)[0];
    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("data:") &&
      !url.startsWith("asset://") &&
      !url.startsWith("blob:")
    ) {
      count++;
    }
  }
  return count;
}
