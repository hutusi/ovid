import { describe, expect, it } from "bun:test";
import {
  createTodayFlowFrontmatter,
  createTypedFrontmatter,
  joinFrontmatter,
  parseFrontmatter,
  parseYamlFrontmatter,
} from "./frontmatter";

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("returns empty frontmatter and full body when there is no frontmatter", () => {
    const raw = "Hello world\n";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toBe("");
    expect(body).toBe("Hello world\n");
  });

  it("returns empty frontmatter for an empty string", () => {
    const { frontmatter, body } = parseFrontmatter("");
    expect(frontmatter).toBe("");
    expect(body).toBe("");
  });

  it("splits frontmatter and body correctly", () => {
    const raw = "---\ntitle: Hello\n---\nBody text\n";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toBe("---\ntitle: Hello\n---\n");
    expect(body).toBe("Body text\n");
  });

  it("handles frontmatter with no body", () => {
    const raw = "---\ntitle: Hello\n---\n";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toBe("---\ntitle: Hello\n---\n");
    expect(body).toBe("");
  });

  it("handles CRLF line endings", () => {
    const raw = "---\r\ntitle: Hello\r\n---\r\nBody\r\n";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toBe("---\r\ntitle: Hello\r\n---\r\n");
    expect(body).toBe("Body\r\n");
  });

  it("does not treat a lone --- as frontmatter", () => {
    const raw = "---\nNo closing fence\n";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toBe("");
    expect(body).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// joinFrontmatter
// ---------------------------------------------------------------------------

describe("joinFrontmatter", () => {
  it("concatenates frontmatter and body verbatim", () => {
    expect(joinFrontmatter("---\ntitle: Hi\n---\n", "Body\n")).toBe("---\ntitle: Hi\n---\nBody\n");
  });

  it("works when frontmatter is empty", () => {
    expect(joinFrontmatter("", "Body\n")).toBe("Body\n");
  });

  it("round-trips through parseFrontmatter", () => {
    const original = "---\ntitle: Round-trip\n---\nContent here\n";
    const { frontmatter, body } = parseFrontmatter(original);
    expect(joinFrontmatter(frontmatter, body)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// parseYamlFrontmatter
// ---------------------------------------------------------------------------

describe("parseYamlFrontmatter", () => {
  it("returns empty object when there is no frontmatter", () => {
    expect(parseYamlFrontmatter("Just a body\n")).toEqual({});
  });

  it("parses string fields", () => {
    const raw = "---\ntitle: My Post\nauthor: Alice\n---\n";
    expect(parseYamlFrontmatter(raw)).toEqual({ title: "My Post", author: "Alice" });
  });

  it("parses boolean and number fields", () => {
    const raw = "---\ndraft: true\nweight: 42\n---\n";
    expect(parseYamlFrontmatter(raw)).toEqual({ draft: true, weight: 42 });
  });

  it("parses string array fields", () => {
    const raw = "---\ntags:\n  - rust\n  - tauri\n---\n";
    const result = parseYamlFrontmatter(raw);
    expect(result.tags).toEqual(["rust", "tauri"]);
  });

  it("converts Date values to YYYY-MM-DD strings", () => {
    const raw = "---\ndate: 2024-01-15\n---\n";
    const result = parseYamlFrontmatter(raw);
    expect(result.date).toBe("2024-01-15");
  });

  it("preserves null values", () => {
    const raw = "---\nslug: ~\n---\n";
    expect(parseYamlFrontmatter(raw)).toEqual({ slug: null });
  });

  it("returns empty object for malformed YAML", () => {
    const raw = "---\n: bad: yaml: [\n---\n";
    expect(parseYamlFrontmatter(raw)).toEqual({});
  });

  it("returns empty object when YAML root is not an object", () => {
    const raw = "---\n- item1\n- item2\n---\n";
    expect(parseYamlFrontmatter(raw)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// createTypedFrontmatter
// ---------------------------------------------------------------------------

describe("createTypedFrontmatter", () => {
  it("produces valid fenced frontmatter", () => {
    const result = createTypedFrontmatter("my-post", "post");
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("---\n")).toBe(true);
  });

  it("includes the provided content type", () => {
    const result = createTypedFrontmatter("my-post", "note");
    expect(result).toContain("type: note");
  });

  it("quotes type values that would be coerced by YAML (e.g. 'true')", () => {
    const result = createTypedFrontmatter("my-post", "true");
    // js-yaml must quote 'true' so it stays a string, not a boolean
    expect(result).toMatch(/type: ['"]true['"]/);
  });

  it("converts slug to title case for the title field", () => {
    const result = createTypedFrontmatter("hello-world", "post");
    expect(result).toContain("title: Hello World");
  });

  it("converts underscores in slug to spaces in title", () => {
    const result = createTypedFrontmatter("hello_world", "page");
    expect(result).toContain("title: Hello World");
  });

  it("sets draft: true", () => {
    const result = createTypedFrontmatter("my-post", "post");
    expect(result).toContain("draft: true");
  });

  it("includes a date field in YYYY-MM-DD format", () => {
    const result = createTypedFrontmatter("my-post", "post");
    expect(result).toMatch(/date: \d{4}-\d{2}-\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// createTodayFlowFrontmatter
// ---------------------------------------------------------------------------

describe("createTodayFlowFrontmatter", () => {
  it("produces valid fenced frontmatter", () => {
    const result = createTodayFlowFrontmatter();
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("---\n")).toBe(true);
  });

  it("contains only tags: []", () => {
    const result = createTodayFlowFrontmatter();
    expect(result).toContain("tags: []");
  });

  it("does not include title, date, type, or draft fields", () => {
    const result = createTodayFlowFrontmatter();
    expect(result).not.toMatch(/\btitle:/);
    expect(result).not.toMatch(/\bdate:/);
    expect(result).not.toMatch(/\btype:/);
    expect(result).not.toMatch(/\bdraft:/);
  });

  it("parses to an empty tags array via parseYamlFrontmatter", () => {
    const result = createTodayFlowFrontmatter();
    const parsed = parseYamlFrontmatter(result);
    expect(parsed.tags).toEqual([]);
    expect(Object.keys(parsed)).toEqual(["tags"]);
  });
});
