// Helpers for navigating the editor to a specific search match.
//
// A workspace search result's `lineNumber` is 1-based into the *whole file*
// (frontmatter included), while the editor document holds only the body. To
// jump to the right occurrence of a repeated line we map the file line to a
// body line, then pick which occurrence of the matched text — among identical
// body lines — sits closest to it. That occurrence rank is then applied to the
// in-document matches (which are in document order), so repeated lines,
// Markdown syntax, and formatted text land on the clicked match rather than
// the first one on the page.

import { parseFrontmatter } from "./frontmatter";

/** Number of full-file lines that precede the body's first line — i.e. the
 *  lines the frontmatter block occupies. `raw` is the whole on-disk file. */
export function frontmatterLineOffset(raw: string): number {
  const { frontmatter } = parseFrontmatter(raw);
  if (frontmatter === "") return 0;
  // body = raw.slice(frontmatter.length), so the body's first line index in
  // the full file equals the newline count of the frontmatter prefix.
  let count = 0;
  for (let i = 0; i < frontmatter.length; i++) {
    if (frontmatter[i] === "\n") count++;
  }
  return count;
}

/** Among body lines whose trimmed text equals `lineContent`, return the 0-based
 *  occurrence rank closest to `targetBodyLine` (0-based). Returns 0 when there
 *  are no exact matches (the caller then falls back to the first match). */
export function matchOccurrenceRank(
  bodyLines: string[],
  lineContent: string,
  targetBodyLine: number
): number {
  const target = lineContent.trim();
  let rank = 0;
  let bestRank = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let line = 0; line < bodyLines.length; line++) {
    if (bodyLines[line].trim() !== target) continue;
    const distance = Math.abs(line - targetBodyLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRank = rank;
    }
    rank++;
  }
  return bestRank;
}
