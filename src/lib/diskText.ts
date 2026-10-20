/** How a text file is encoded on disk, beyond its characters: a leading UTF-8
 *  byte-order mark, and its line endings. The editor works in LF without a BOM
 *  (Tiptap's serializer emits LF; a BOM would sit in the first paragraph as an
 *  invisible character), so saves re-apply the file's own format — a CRLF file
 *  stays CRLF throughout instead of ending up with an LF body under a CRLF
 *  frontmatter block, and a BOM survives. */
export interface DiskTextFormat {
  bom: boolean;
  eol: "\n" | "\r\n";
}

export const DEFAULT_DISK_FORMAT: DiskTextFormat = { bom: false, eol: "\n" };

const BOM = "﻿";

/** The format of `raw` as read from disk. Line endings follow the majority,
 *  so a CRLF file with one stray LF line is still treated (and saved) as CRLF. */
export function detectDiskFormat(raw: string): DiskTextFormat {
  const crlf = raw.match(/\r\n/g)?.length ?? 0;
  const lf = (raw.match(/\n/g)?.length ?? 0) - crlf;
  return { bom: raw.startsWith(BOM), eol: crlf > lf ? "\r\n" : "\n" };
}

/** `raw` without its BOM, if any. */
export function stripBom(raw: string): string {
  return raw.startsWith(BOM) ? raw.slice(1) : raw;
}

/** Text as it should be written to disk in `format`: every line ending made
 *  uniform, and the BOM restored. */
export function encodeDiskText(text: string, format: DiskTextFormat): string {
  const normalized = stripBom(text).replace(/\r\n/g, "\n");
  const lines = format.eol === "\n" ? normalized : normalized.replace(/\n/g, "\r\n");
  return format.bom ? BOM + lines : lines;
}
