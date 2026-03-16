import { dump, load } from "js-yaml";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const YAML_INNER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export type FrontmatterValue = string | boolean | number | string[] | null;
export type ParsedFrontmatter = Record<string, FrontmatterValue>;

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

export function serializeFrontmatter(frontmatter: ParsedFrontmatter): string {
  const obj: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(frontmatter)) {
    if (val !== null && val !== undefined) obj[key] = val;
  }
  const yaml = dump(obj, { lineWidth: -1 }).trimEnd();
  return `---\n${yaml}\n---\n`;
}

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

export function parseYamlFrontmatter(raw: string): ParsedFrontmatter {
  const match = YAML_INNER_RE.exec(raw);
  if (!match) return {};

  try {
    const parsed = load(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const result: ParsedFrontmatter = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val === null || val === undefined) {
        result[key] = null;
      } else if (val instanceof Date) {
        result[key] = val.toISOString().slice(0, 10);
      } else if (typeof val === "string" || typeof val === "boolean" || typeof val === "number") {
        result[key] = val;
      } else if (Array.isArray(val)) {
        result[key] = val.filter((v): v is string => typeof v === "string");
      }
    }
    return result;
  } catch {
    return {};
  }
}
