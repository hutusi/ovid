import {
  dumpFrontmatterBlock,
  type FrontmatterData,
  joinFrontmatter,
  loadFrontmatterBlock,
  parseFrontmatter,
  yamlDate,
} from "./frontmatter";

/** The value a known post field starts with in a post created from an
 *  existing one; `undefined` keeps the source value as is. */
function resetPostTemplateField(key: string, today: string): unknown {
  switch (key.toLowerCase()) {
    case "title":
    case "slug":
    case "coverimage":
      return "";
    case "date":
      return yamlDate(today);
    case "draft":
      return true;
    case "featured":
    case "pinned":
      return false;
    case "tags":
      return [];
    default:
      return undefined;
  }
}

/** Frontmatter for a new post modelled on `raw`: per-post fields reset, every
 *  other field (nested ones included) kept. Unparseable frontmatter is copied
 *  verbatim rather than rewritten. */
export function createPostFromExistingContent(raw: string, now: Date = new Date()): string {
  const { frontmatter } = parseFrontmatter(raw);
  if (!frontmatter) return "";

  const loaded = loadFrontmatterBlock(frontmatter);
  if (!loaded.ok || Object.keys(loaded.data).length === 0) {
    return frontmatter;
  }

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  const next: FrontmatterData = {};

  for (const [key, value] of Object.entries(loaded.data)) {
    next[key] = resetPostTemplateField(key, today) ?? value;
  }

  return joinFrontmatter(dumpFrontmatterBlock(next), "");
}
