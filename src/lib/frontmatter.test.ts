import { describe, expect, it } from "bun:test";
import {
  createTodayFlowFrontmatter,
  createTypedFrontmatter,
  editFrontmatterField,
  type FrontmatterEdit,
  joinFrontmatter,
  loadFrontmatterBlock,
  parseFrontmatter,
  parseYamlFrontmatter,
  setFrontmatterKey,
} from "./frontmatter";

function edited(result: FrontmatterEdit): string {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.block;
}

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

  it("treats an empty fenced block as empty frontmatter", () => {
    const { frontmatter, body } = parseFrontmatter("---\n---\nBody\n");
    expect(frontmatter).toBe("---\n---\n");
    expect(body).toBe("Body\n");
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

  it("shows a datetime's date as written, without a UTC shift", () => {
    // 01:30 at +08:00 is the previous day in UTC; the panel must not say so.
    const raw = "---\ndate: 2024-01-15T01:30:00+08:00\n---\n";
    expect(parseYamlFrontmatter(raw).date).toBe("2024-01-15");
  });

  it("leaves structured values out of the projection", () => {
    const raw =
      "---\ntitle: T\nseo:\n  description: d\nitems:\n  - post: a\ntags: [a, 2024]\n---\n";
    expect(parseYamlFrontmatter(raw)).toEqual({ title: "T", tags: ["a", "2024"] });
  });
});

// ---------------------------------------------------------------------------
// loadFrontmatterBlock
// ---------------------------------------------------------------------------

describe("loadFrontmatterBlock", () => {
  it("treats a missing or empty block as an empty mapping", () => {
    expect(loadFrontmatterBlock("")).toEqual({ ok: true, data: {} });
    expect(loadFrontmatterBlock("---\n---\n")).toEqual({ ok: true, data: {} });
  });

  it("fails on invalid YAML instead of returning an empty mapping", () => {
    expect(loadFrontmatterBlock("---\ntitle: [unclosed\n---\n").ok).toBe(false);
    expect(loadFrontmatterBlock("---\n- a\n- b\n---\n").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// editFrontmatterField — properties-panel edits on the raw mapping
// ---------------------------------------------------------------------------

describe("editFrontmatterField", () => {
  const RICH = `---
title: Old title # the working title
date: 2024-01-15
updated: 2024-01-15T09:30:00+08:00
seo:
  description: A description
  keywords: [one, two]
items:
  - post: first
  - series: second
    label: Second
ratings: [1, 2, 3]
slug: ~
tags:
- writing
- notes

# publishing
draft: true
---
`;

  it("changes only the edited key's line", () => {
    const out = edited(editFrontmatterField(RICH, "title", "New title"));
    expect(out).toBe(RICH.replace("title: Old title # the working title", "title: New title"));
  });

  it("keeps nested maps, lists of maps, numeric lists and null keys", () => {
    const out = edited(editFrontmatterField(RICH, "draft", false));
    const loaded = loadFrontmatterBlock(out);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.data.seo).toEqual({ description: "A description", keywords: ["one", "two"] });
    expect(loaded.data.items).toEqual([{ post: "first" }, { series: "second", label: "Second" }]);
    expect(loaded.data.ratings).toEqual([1, 2, 3]);
    expect("slug" in loaded.data).toBe(true);
    expect(out).toContain("# publishing");
  });

  it("writes date fields as unquoted YAML dates", () => {
    const out = edited(editFrontmatterField(RICH, "date", "2025-02-03"));
    expect(out).toContain("\ndate: 2025-02-03\n");
  });

  it("editing a datetime's date keeps its time and offset", () => {
    const out = edited(editFrontmatterField(RICH, "updated", "2025-02-03"));
    expect(out).toContain("\nupdated: 2025-02-03T09:30:00+08:00\n");
  });

  it("returns the block verbatim when the value didn't change", () => {
    expect(edited(editFrontmatterField(RICH, "updated", "2024-01-15"))).toBe(RICH);
    expect(edited(editFrontmatterField(RICH, "draft", true))).toBe(RICH);
  });

  it("quotes a text value that would otherwise read back as a date", () => {
    const out = edited(editFrontmatterField(RICH, "title", "2024-01-01"));
    expect(out).toContain("title: '2024-01-01'");
  });

  it("removes a key when set to null", () => {
    const out = edited(editFrontmatterField(RICH, "seo", null));
    expect(out).not.toContain("seo:");
    expect(out).not.toContain("A description");
    expect(out).toContain("items:");
  });

  it("replaces a multi-line value whole, including column-0 sequence items", () => {
    const out = edited(editFrontmatterField(RICH, "tags", ["fiction"]));
    expect(out).not.toContain("- writing");
    expect(out).toContain("tags:\n  - fiction\n\n# publishing\ndraft: true");
  });

  it("appends a new key before the closing fence", () => {
    const out = edited(editFrontmatterField("---\ntitle: T\n---\n", "featured", true));
    expect(out).toBe("---\ntitle: T\nfeatured: true\n---\n");
  });

  it("renames a case-variant known key to its canonical spelling in place", () => {
    const out = edited(editFrontmatterField("---\nTitle: Old\nauthor: me\n---\n", "title", "New"));
    expect(out).toBe("---\ntitle: New\nauthor: me\n---\n");
  });

  it("creates frontmatter for a file that has none", () => {
    expect(edited(editFrontmatterField("", "title", "Hello"))).toBe("---\ntitle: Hello\n---\n");
  });

  it("keeps CRLF line endings", () => {
    const block = "---\r\ntitle: Old\r\ndate: 2024-01-01\r\n---\r\n";
    expect(edited(editFrontmatterField(block, "title", "New"))).toBe(
      "---\r\ntitle: New\r\ndate: 2024-01-01\r\n---\r\n"
    );
  });

  it("removing the last key leaves an empty block that still parses", () => {
    const out = edited(editFrontmatterField("---\ntitle: T\n---\n", "title", null));
    expect(out).toBe("---\n---\n");
    expect(parseFrontmatter(`${out}Body`).body).toBe("Body");
  });

  it("refuses to edit frontmatter whose YAML doesn't parse", () => {
    const result = editFrontmatterField("---\ntitle: [unclosed\nkeep: me\n---\n", "title", "x");
    expect(result.ok).toBe(false);
  });
});

describe("setFrontmatterKey", () => {
  it("writes structured values", () => {
    const out = edited(setFrontmatterKey("---\ntitle: T\n---\n", "items", [{ post: "a" }]));
    expect(out).toBe("---\ntitle: T\nitems:\n  - post: a\n---\n");
  });

  it("falls back to a whole-block dump when the key isn't on lines of its own", () => {
    const block = "---\n{ title: T, items: [] }\n---\n";
    const out = edited(setFrontmatterKey(block, "items", [{ post: "a" }]));
    const loaded = loadFrontmatterBlock(out);
    expect(loaded.ok && loaded.data).toEqual({ title: "T", items: [{ post: "a" }] });
  });

  it("edits a block whose aliases refer to themselves", () => {
    const block = "---\ntitle: A\nmeta: &m { self: *m }\nlist: &l [1, *l]\n---\n";
    expect(edited(editFrontmatterField(block, "title", "B"))).toBe(
      "---\ntitle: B\nmeta: &m { self: *m }\nlist: &l [1, *l]\n---\n"
    );
    expect(edited(editFrontmatterField(block, "title", "A"))).toBe(block);
    expect(edited(setFrontmatterKey(block, "items", ["a"]))).toBe(
      "---\ntitle: A\nmeta: &m { self: *m }\nlist: &l [1, *l]\nitems:\n  - a\n---\n"
    );
  });

  it("keeps a self-referencing alias through the whole-block fallback", () => {
    const out = edited(
      setFrontmatterKey("---\n{ title: T, m: &m { self: *m } }\n---\n", "title", "U")
    );
    const loaded = loadFrontmatterBlock(out);
    if (!loaded.ok) throw new Error(loaded.error);
    const m = loaded.data.m as { self: unknown };
    expect(loaded.data.title).toBe("U");
    expect(m.self).toBe(m);
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
