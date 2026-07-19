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

/** Strip common leading block markers and inline emphasis/code markers from a
 *  raw Markdown line, approximating the rendered text so a search jump can
 *  locate a formatted line in the ProseMirror document (whose text nodes carry
 *  no `#`, `**`, etc.). Best-effort — it covers headings, blockquotes, list and
 *  task items, bold/italic/strike, and inline code, not arbitrary inline markup
 *  like links. Returns the input unchanged when nothing strips. */
export function stripLineMarkers(line: string): string {
  let out = line.trim();
  // Leading block markers, applied once (e.g. "> - [ ] # x" is not realistic).
  out = out
    .replace(/^#{1,6}\s+/, "") // ATX heading
    .replace(/^>\s?/, "") // blockquote
    .replace(/^(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, ""); // list / task item
  // Inline emphasis + code markers anywhere in the line.
  out = out.replace(/\*\*|__|~~|[*_`]/g, "");
  return out.trim();
}

/** Among body lines whose `normalize`d text equals the `normalize`d
 *  `lineContent`, return the 0-based occurrence rank closest to `targetBodyLine`
 *  (0-based). Returns 0 when there are no matches (the caller then falls back to
 *  the first match). `normalize` MUST match the transform used to produce the
 *  in-document hits being ranked — otherwise the rank counts a different set of
 *  candidates than the hits it indexes into (e.g. ranking raw `**foo**` lines
 *  while the hits are every rendered `foo`). Defaults to a plain trim. */
export function matchOccurrenceRank(
  bodyLines: string[],
  lineContent: string,
  targetBodyLine: number,
  normalize: (line: string) => string = (line) => line.trim()
): number {
  const target = normalize(lineContent);
  let rank = 0;
  let bestRank = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let line = 0; line < bodyLines.length; line++) {
    if (normalize(bodyLines[line]) !== target) continue;
    const distance = Math.abs(line - targetBodyLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRank = rank;
    }
    rank++;
  }
  return bestRank;
}
