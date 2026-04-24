import type { FrontmatterValue, ParsedFrontmatter } from "./frontmatter";

export type FrontmatterFieldKind = "text" | "boolean" | "date" | "tags" | "path";
export type CustomFrontmatterValueType = "text" | "boolean" | "number" | "date" | "tags";
const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FrontmatterFieldSchema {
  key: string;
  label: string;
  kind: FrontmatterFieldKind;
  hidden?: boolean;
  addable?: boolean;
  defaultValue?: FrontmatterValue;
}

export const FRONTMATTER_FIELD_SCHEMA: Record<string, FrontmatterFieldSchema> = {
  title: { key: "title", label: "Title", kind: "text" },
  type: { key: "type", label: "Type", kind: "text", hidden: true },
  draft: { key: "draft", label: "Draft", kind: "boolean" },
  featured: {
    key: "featured",
    label: "Featured",
    kind: "boolean",
    addable: true,
    defaultValue: false,
  },
  pinned: {
    key: "pinned",
    label: "Pinned",
    kind: "boolean",
    addable: true,
    defaultValue: false,
  },
  date: { key: "date", label: "Date", kind: "date" },
  tags: { key: "tags", label: "Tags", kind: "tags" },
  coverImage: {
    key: "coverImage",
    label: "Cover Image",
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

export function getFrontmatterFieldLabel(key: string): string {
  return getFrontmatterFieldSchema(key)?.label ?? key;
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

export function getMissingAddableFrontmatterFields(frontmatter: ParsedFrontmatter): string[] {
  const presentKeys = new Set(
    Object.entries(frontmatter)
      .filter(([, value]) => value != null)
      .map(([key]) => resolveKnownFrontmatterFieldKey(key) ?? key)
  );
  return Object.values(FRONTMATTER_FIELD_SCHEMA)
    .filter((field) => field.addable && !presentKeys.has(field.key))
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
