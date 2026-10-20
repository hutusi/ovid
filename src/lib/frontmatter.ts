import { DEFAULT_SCHEMA, dump, load, Type } from "js-yaml";
import { getFrontmatterFieldSchema, resolveKnownFrontmatterFieldKey } from "./frontmatterSchema";

// The fenced block at the very top of a file. The YAML between the fences may
// be empty (`---\n---\n`): an empty mapping, not two thematic breaks. The
// closing fence must end its line (trailing blanks allowed).
const FRONTMATTER_RE = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

export type FrontmatterValue = string | boolean | number | string[] | null;
/** The display projection of a frontmatter mapping: what the properties panel
 *  can show and edit. Structured values (nested maps, lists of maps) are left
 *  out — they live only in the raw mapping and survive every edit. */
export type ParsedFrontmatter = Record<string, FrontmatterValue>;
/** A frontmatter mapping exactly as loaded, every value kept. */
export type FrontmatterData = Record<string, unknown>;

export function parseFrontmatter(raw: string): {
  frontmatter: string;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(raw);
  if (match) {
    return { frontmatter: match[0], body: raw.slice(match[0].length) };
  }
  return { frontmatter: "", body: raw };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter + body;
}

// ─── Timestamps ────────────────────────────────────────────────────────────

/** A YAML timestamp kept as the exact text that was written. js-yaml's default
 *  timestamp type turns `2024-01-01` into a UTC `Date`, which re-dumps as
 *  `2024-01-01T00:00:00.000Z` and (sliced back to a date) shows a positive-
 *  offset datetime as the previous day. Keeping the source text means
 *  `date: 2024-01-01` and `date: 2024-01-01T10:30:00+08:00` survive any edit
 *  byte for byte. */
export class YamlTimestamp {
  constructor(readonly raw: string) {}

  /** The calendar date as written (`YYYY-MM-DD`), with no timezone shift. */
  get date(): string {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(this.raw);
    if (!match) return this.raw;
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  /** Whatever follows the date part (the time and offset), or "". */
  get timeSuffix(): string {
    const match = /^\d{4}-\d{1,2}-\d{1,2}/.exec(this.raw);
    return match ? this.raw.slice(match[0].length) : "";
  }

  toString(): string {
    return this.raw;
  }
}

// YAML 1.1 timestamps, as js-yaml's own timestamp type recognises them.
const YAML_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const YAML_DATETIME_RE =
  /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?$/;

function isTimestampText(value: string): boolean {
  return YAML_DATE_RE.test(value) || YAML_DATETIME_RE.test(value);
}

const yamlTimestampType = new Type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: (data: unknown) => typeof data === "string" && isTimestampText(data),
  construct: (data: string) => new YamlTimestamp(data),
  instanceOf: YamlTimestamp,
  represent: (value: object) => (value as YamlTimestamp).raw,
});

/** js-yaml's default schema with timestamps kept as source text (a type with
 *  the same tag replaces the built-in one). Because the timestamp type stays
 *  *implicit*, a plain string that merely looks like a date is still quoted on
 *  dump, so it doesn't turn into a timestamp. */
const FRONTMATTER_SCHEMA = DEFAULT_SCHEMA.extend({ implicit: [yamlTimestampType] });

// ─── Loading ───────────────────────────────────────────────────────────────

export type FrontmatterLoad = { ok: true; data: FrontmatterData } | { ok: false; error: string };

interface BlockParts {
  /** Lines of the block, each with its own line ending (if any). */
  lines: string[];
  /** Index of the closing `---` line. */
  closeIndex: number;
  eol: "\n" | "\r\n";
}

/** Split a frontmatter block (`---\n…\n---\n`, as produced by
 *  parseFrontmatter) into lines. Null for anything else. */
function splitBlock(block: string): BlockParts | null {
  if (!FRONTMATTER_RE.test(block)) return null;
  const lines = block.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const closeIndex = lines.findIndex((line, index) => index > 0 && /^---[ \t]*\r?\n?$/.test(line));
  if (closeIndex === -1) return null;
  return { lines, closeIndex, eol: block.includes("\r\n") ? "\r\n" : "\n" };
}

/** Parse the frontmatter mapping at the top of `text` (a frontmatter block or
 *  a whole file). No frontmatter, or an empty one, is an empty mapping. Fails
 *  when the YAML is invalid or isn't a mapping — callers must then refuse to
 *  edit, since any rewrite would destroy what they can't read. */
export function loadFrontmatterBlock(text: string): FrontmatterLoad {
  const { frontmatter } = parseFrontmatter(text);
  const parts = splitBlock(frontmatter);
  if (!parts) return { ok: true, data: {} };
  const inner = parts.lines.slice(1, parts.closeIndex).join("");
  try {
    const parsed = load(inner, { schema: FRONTMATTER_SCHEMA });
    if (parsed === null || parsed === undefined) return { ok: true, data: {} };
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "frontmatter is not a key/value mapping" };
    }
    return { ok: true, data: parsed as FrontmatterData };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The editable display projection of a loaded mapping. */
export function projectFrontmatter(data: FrontmatterData): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result[key] = null;
    } else if (value instanceof YamlTimestamp) {
      result[key] = value.date;
    } else if (value instanceof Date) {
      result[key] = value.toISOString().slice(0, 10);
    } else if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number"
    ) {
      result[key] = value;
    } else if (Array.isArray(value) && value.every(isScalar)) {
      result[key] = value.map((item) => (item instanceof YamlTimestamp ? item.raw : String(item)));
    }
    // Nested maps and lists of maps are not projected: the panel can't edit
    // them, and they stay untouched in the raw mapping.
  }
  return result;
}

function isScalar(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof YamlTimestamp
  );
}

/** Display projection of the frontmatter at the top of `text`; `{}` when it
 *  is missing or unparseable. */
export function parseYamlFrontmatter(text: string): ParsedFrontmatter {
  const loaded = loadFrontmatterBlock(text);
  return loaded.ok ? projectFrontmatter(loaded.data) : {};
}

// ─── Writing ───────────────────────────────────────────────────────────────

function dumpYaml(data: FrontmatterData): string {
  return dump(data, { schema: FRONTMATTER_SCHEMA, lineWidth: -1 });
}

/** Serialize a whole mapping as a fenced block, in the given line ending. */
export function dumpFrontmatterBlock(data: FrontmatterData, eol: "\n" | "\r\n" = "\n"): string {
  const yaml = Object.keys(data).length === 0 ? "" : dumpYaml(data);
  return `---\n${yaml}---\n`.replace(/\n/g, eol);
}

export type FrontmatterEdit = { ok: true; block: string } | { ok: false; error: string };

/** Set (or, with `undefined`, delete) one top-level key in a frontmatter
 *  block, leaving everything else as it was.
 *
 *  Works on the raw mapping, never on the display projection, so nested maps,
 *  lists of maps, timestamps and keys the panel doesn't show all survive. The
 *  edit is spliced into the block line-wise when the key sits on its own
 *  top-level lines, which also keeps every other line — comments included —
 *  byte for byte; the result is re-parsed to prove it, falling back to a
 *  whole-block dump (key order kept) when the splice can't be verified.
 *  Refuses when the YAML can't be parsed. */
export function setFrontmatterKey(
  block: string,
  key: string,
  value: unknown,
  { renameFrom }: { renameFrom?: string } = {}
): FrontmatterEdit {
  const loaded = loadFrontmatterBlock(block);
  if (!loaded.ok) return loaded;
  const data = loaded.data;
  const existingKey =
    renameFrom !== undefined && hasOwn(data, renameFrom)
      ? renameFrom
      : hasOwn(data, key)
        ? key
        : undefined;

  if (value === undefined && existingKey === undefined) return { ok: true, block };
  if (existingKey === key && value !== undefined && deepEqual(data[key], value)) {
    return { ok: true, block };
  }

  // The mapping the edit must produce: the key replaced in place (renamed
  // keys keep their position), appended when new, removed on delete.
  const expected: FrontmatterData = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === existingKey) {
      if (value !== undefined) expected[key] = value;
    } else if (k !== key) {
      expected[k] = v;
    }
  }
  if (existingKey === undefined && value !== undefined) expected[key] = value;

  const parts = splitBlock(block);
  if (parts) {
    const spliced = spliceKey(parts, existingKey, key, value);
    if (spliced !== null) {
      const check = loadFrontmatterBlock(spliced);
      if (check.ok && deepEqual(check.data, expected)) return { ok: true, block: spliced };
    }
  }
  return { ok: true, block: dumpFrontmatterBlock(expected, parts?.eol ?? "\n") };
}

/** Replace the lines of top-level `existingKey` (or append a new key before
 *  the closing fence) with the dump of `key: value`. Null when the key can't
 *  be located on lines of its own. */
function spliceKey(
  parts: BlockParts,
  existingKey: string | undefined,
  key: string,
  value: unknown
): string | null {
  const { lines, closeIndex, eol } = parts;
  const replacement = value === undefined ? "" : dumpYaml({ [key]: value }).replace(/\n/g, eol);

  if (existingKey === undefined) {
    const next = [...lines];
    next.splice(closeIndex, 0, replacement);
    return next.join("");
  }

  const escaped = existingKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyLine = new RegExp(
    `^(?:${escaped}|"${escaped}"|'${escaped}')[ \\t]*:(?:[ \\t]|\\r?\\n|$)`
  );
  const start = lines.findIndex(
    (line, index) => index > 0 && index < closeIndex && keyLine.test(line)
  );
  if (start === -1) return null;
  // The value continues over indented lines, blank lines and block-sequence
  // items written at column 0 (`tags:\n- a`); trailing blank lines belong to
  // the gap before the next key, not to this value.
  let end = start + 1;
  while (end < closeIndex && /^(?:[ \t]|-(?:[ \t]|\r?\n|$)|\r?\n|$)/.test(lines[end])) end++;
  while (end > start + 1 && /^[ \t]*\r?\n?$/.test(lines[end - 1])) end--;

  const next = [...lines];
  next.splice(start, end - start, replacement);
  return next.join("");
}

/** Own-key check without Object.hasOwn (ES2022; the app targets ES2020). */
function hasOwn(object: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(object, key);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof YamlTimestamp || b instanceof YamlTimestamp) {
    return a instanceof YamlTimestamp && b instanceof YamlTimestamp && a.raw === b.raw;
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        (k) =>
          hasOwn(b, k) &&
          deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
      )
    );
  }
  return Number.isNaN(a) && Number.isNaN(b);
}

/** Apply one properties-panel edit to a frontmatter block.
 *
 *  `key` is resolved like the panel does: a known field matches its
 *  case-variants (`Title:` is the title), and the edit renames such a key to
 *  its canonical spelling in place. `null` removes the key. Date fields — and
 *  any key whose current value is a timestamp — are written as unquoted YAML
 *  dates, and editing just the date of a datetime keeps its time and offset. */
export function editFrontmatterField(
  block: string,
  key: string,
  value: FrontmatterValue
): FrontmatterEdit {
  const loaded = loadFrontmatterBlock(block);
  if (!loaded.ok) return loaded;
  const canonicalKey = resolveKnownFrontmatterFieldKey(key) ?? key;
  const existingKey = Object.keys(loaded.data).find(
    (k) => (resolveKnownFrontmatterFieldKey(k) ?? k) === canonicalKey
  );
  const current = existingKey === undefined ? undefined : loaded.data[existingKey];
  return setFrontmatterKey(block, canonicalKey, toYamlValue(canonicalKey, value, current), {
    renameFrom: existingKey,
  });
}

function toYamlValue(key: string, value: FrontmatterValue, current: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value !== "string") return value;
  if (current instanceof YamlTimestamp) {
    if (value === current.date) return current;
    if (YAML_DATE_RE.test(value)) return new YamlTimestamp(value + current.timeSuffix);
    if (isTimestampText(value)) return new YamlTimestamp(value);
    return value;
  }
  if (getFrontmatterFieldSchema(key)?.kind === "date" && isTimestampText(value)) {
    return new YamlTimestamp(value);
  }
  return value;
}

/** A value that dumps as an unquoted YAML date, exactly as given. */
export function yamlDate(date: string): YamlTimestamp {
  return new YamlTimestamp(date);
}

// ─── Scaffolding ───────────────────────────────────────────────────────────

export function createAmytisFrontmatter(slug: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const title = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `---\ntitle: "${title}"\ndate: ${today}\ndraft: true\n---\n`;
}

/** Serialize a string as a YAML scalar (quoted when necessary). */
function yamlScalar(val: string): string {
  return dump(val).trimEnd(); // js-yaml adds quotes/escapes as needed
}

export function createTypedFrontmatter(slug: string, type: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const title = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `---\ntitle: ${yamlScalar(title)}\ndate: ${today}\ntype: ${yamlScalar(type)}\ndraft: true\n---\n`;
}

export function createTodayFlowFrontmatter(): string {
  return `---\ntags: []\n---\n`;
}
