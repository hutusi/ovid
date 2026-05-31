import type { FrontmatterValue, ParsedFrontmatter } from "./frontmatter";

export type FrontmatterFieldKind =
  | "text"
  | "longtext"
  | "boolean"
  | "date"
  | "tags"
  | "path"
  | "enum";
export type CustomFrontmatterValueType = "text" | "boolean" | "number" | "date" | "tags";
const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export interface FrontmatterFieldSchema {
  key: string;
  /** i18n key resolved against the active locale at render time. Optional for
   *  hidden fields that never reach the UI. */
  labelKey?: string;
  kind: FrontmatterFieldKind;
  hidden?: boolean;
  addable?: boolean;
  defaultValue?: FrontmatterValue;
  /** Allowed values for `kind: "enum"`. Display order matches the dropdown. */
  options?: readonly string[];
  /** Optional context-gate for `addable: true`. When present, the field only
   *  appears in the "Add field" affordance if this predicate is satisfied
   *  (e.g. `sort` only makes sense on series). Already-present values still
   *  render unconditionally. */
  addableFor?: (contentType: string | undefined) => boolean;
}

export const FRONTMATTER_FIELD_SCHEMA: Record<string, FrontmatterFieldSchema> = {
  title: { key: "title", labelKey: "properties.title", kind: "text" },
  type: { key: "type", kind: "text", hidden: true },
  excerpt: {
    key: "excerpt",
    labelKey: "properties.excerpt",
    kind: "longtext",
    addable: true,
    defaultValue: "",
  },
  draft: {
    key: "draft",
    labelKey: "properties.draft",
    kind: "boolean",
    addable: true,
    defaultValue: false,
  },
  featured: {
    key: "featured",
    labelKey: "properties.featured",
    kind: "boolean",
    addable: true,
    defaultValue: false,
  },
  pinned: {
    key: "pinned",
    labelKey: "properties.pinned",
    kind: "boolean",
    addable: true,
    defaultValue: false,
  },
  date: { key: "date", labelKey: "properties.date", kind: "date" },
  tags: { key: "tags", labelKey: "properties.tags", kind: "tags" },
  sort: {
    key: "sort",
    labelKey: "properties.sort",
    kind: "enum",
    options: ["date-asc", "date-desc", "manual"],
    addable: true,
    addableFor: (contentType) => contentType === "series",
    defaultValue: "date-desc",
  },
  coverImage: {
    key: "coverImage",
    labelKey: "properties.cover_image",
    kind: "path",
    addable: true,
    defaultValue: "",
  },
};

export function getFrontmatterFieldSchema(key: string): FrontmatterFieldSchema | undefined {
  return FRONTMATTER_FIELD_SCHEMA[key];
}

export function normalizeFrontmatterKey(key: string): string {
  return key.trim().toLowerCase();
}

export function resolveKnownFrontmatterFieldKey(key: string): string | null {
  const normalized = normalizeFrontmatterKey(key);
  return (
    Object.keys(FRONTMATTER_FIELD_SCHEMA).find(
      (schemaKey) => normalizeFrontmatterKey(schemaKey) === normalized
    ) ?? null
  );
}

export function isKnownFrontmatterField(key: string): boolean {
  return resolveKnownFrontmatterFieldKey(key) !== null;
}

/** Known Amytis frontmatter keys that aren't in FRONTMATTER_FIELD_SCHEMA but
 *  still appear in standard scaffolds (post/note/book/chapter templates) and
 *  benefit from a translated display label when rendered through
 *  CustomMetadataField. Keys are case-normalized at lookup time so e.g.
 *  `Authors:` in YAML still resolves. User-defined keys not in this table
 *  fall through to the raw key. */
const EXTRA_FRONTMATTER_LABEL_KEYS: Record<string, string> = {
  authors: "properties.authors",
  category: "properties.category",
  layout: "properties.layout",
  latex: "properties.latex",
  aliases: "properties.aliases",
  chapters: "properties.chapters",
  description: "properties.description",
  slug: "properties.slug",
};

export function getFrontmatterFieldLabel(key: string, t: Translate): string {
  const schema = getFrontmatterFieldSchema(key);
  if (schema?.labelKey) return t(schema.labelKey);
  const extraKey = EXTRA_FRONTMATTER_LABEL_KEYS[normalizeFrontmatterKey(key)];
  if (extraKey) return t(extraKey);
  return key;
}

export function resolveDocumentFrontmatterKey(
  frontmatter: ParsedFrontmatter,
  key: string
): string | null {
  const targetKey = resolveKnownFrontmatterFieldKey(key) ?? key;
  return (
    Object.keys(frontmatter).find((existingKey) => {
      const resolvedExistingKey = resolveKnownFrontmatterFieldKey(existingKey) ?? existingKey;
      return resolvedExistingKey === targetKey;
    }) ?? null
  );
}

export function getFrontmatterFieldValue(
  frontmatter: ParsedFrontmatter,
  key: string
): FrontmatterValue | undefined {
  const documentKey = resolveDocumentFrontmatterKey(frontmatter, key);
  return documentKey ? frontmatter[documentKey] : undefined;
}

export function setFrontmatterFieldValue(
  frontmatter: ParsedFrontmatter,
  key: string,
  value: FrontmatterValue
): ParsedFrontmatter {
  const canonicalKey = resolveKnownFrontmatterFieldKey(key) ?? key;
  const existingKey = resolveDocumentFrontmatterKey(frontmatter, key);
  const updated = { ...frontmatter };
  if (existingKey && existingKey !== canonicalKey) {
    delete updated[existingKey];
  }
  updated[canonicalKey] = value;
  return updated;
}

export function getMissingAddableFrontmatterFields(
  frontmatter: ParsedFrontmatter,
  context: { contentType?: string } = {}
): string[] {
  const presentKeys = new Set(
    Object.entries(frontmatter)
      .filter(([, value]) => value != null)
      .map(([key]) => resolveKnownFrontmatterFieldKey(key) ?? key)
  );
  return Object.values(FRONTMATTER_FIELD_SCHEMA)
    .filter((field) => {
      if (!field.addable || presentKeys.has(field.key)) return false;
      if (field.addableFor && !field.addableFor(context.contentType)) return false;
      return true;
    })
    .map((field) => field.key);
}

export function getFrontmatterFieldDefaultValue(key: string): FrontmatterValue | null {
  return getFrontmatterFieldSchema(key)?.defaultValue ?? null;
}

export function coerceCustomFrontmatterValue(
  type: CustomFrontmatterValueType,
  rawValue: string,
  booleanValue = false
): FrontmatterValue {
  const trimmed = rawValue.trim();

  switch (type) {
    case "boolean":
      return booleanValue;
    case "number": {
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case "date":
      return trimmed || null;
    case "tags":
      return trimmed
        ? trimmed
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : null;
    default:
      return trimmed || null;
  }
}

export function inferCustomFrontmatterValueType(
  value: FrontmatterValue
): CustomFrontmatterValueType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "tags";
  if (typeof value === "string" && DATE_STRING_RE.test(value)) return "date";
  return "text";
}

export function parseBooleanFrontmatterValue(value: FrontmatterValue): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

export function readBooleanFrontmatterValue(value: FrontmatterValue): boolean {
  return parseBooleanFrontmatterValue(value) ?? false;
}

export function coerceFrontmatterInput(key: string, value: string): FrontmatterValue {
  const schema = getFrontmatterFieldSchema(key);
  const trimmed = value.trim();

  if (schema?.kind === "boolean") {
    return parseBooleanFrontmatterValue(trimmed) ?? false;
  }

  if (schema?.kind === "tags") {
    return trimmed
      ? trimmed
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
  }

  return trimmed || null;
}
