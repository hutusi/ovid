// Mirrors Amytis's content-scaffolding scripts (scripts/new-*.ts) so files
// created in Ovid match what `bun run new-*` would produce: folder layout,
// `.mdx`/`.md` extension, date-prefixed posts, and per-type frontmatter.
// Amytis derives a file's content type from its folder, so none of these
// templates write a `type:` field.

export type NewContentKind =
  | "post"
  | "series"
  | "note"
  | "book"
  | "flow"
  | "seriesPost"
  | "chapter"
  | "page"
  | "generic";

export interface ScaffoldInput {
  kind: NewContentKind;
  /** Title the user entered in the New dialog. */
  title: string;
  /** Today's date as YYYY-MM-DD. */
  date: string;
  /** The content tree root (e.g. `<workspace>/content`). */
  contentRoot: string;
  /** `posts.basePath` from site.config (folder name for posts). */
  basePath: string;
  /** The folder the user right-clicked — used by seriesPost/chapter/generic. */
  dirPath: string;
  /** Raw `templates/default.mdx` contents, when present, for posts. */
  postTemplate?: string;
  /** Default author from site.config, used in the book index template. */
  defaultAuthor?: string;
}

export interface ScaffoldOutput {
  /** Directories to ensure exist before writing (parents first). */
  dirsToCreate: string[];
  filePath: string;
  content: string;
}

/** Slugify a title: lowercase, collapse non-alphanumeric (keeping CJK) into
 *  hyphens, trim leading/trailing hyphens. Matches the Amytis note slugifier,
 *  which is the most permissive of the scripts. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // A symbol/emoji-only title (the New dialog only rejects whitespace) collapses
  // to "", which would yield malformed paths like `<date>-.mdx` or `series//`.
  return slug || "untitled";
}

/** Wrap a string as a double-quoted YAML scalar, escaping `\` and `"`. Amytis
 *  templates always double-quote the title, so we mirror that (with escaping
 *  the scripts omit, to stay valid YAML for titles containing quotes). */
function dq(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const DEFAULT_POST_TEMPLATE = `---
title: "{{title}}"
date: "{{date}}"
excerpt: ""
category: "Uncategorized"
tags: []
authors: ["Amytis"]
layout: "post"
draft: false
latex: false
---

Write your content here...
`;

function renderPostTemplate(template: string | undefined, title: string, date: string): string {
  const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return (template ?? DEFAULT_POST_TEMPLATE)
    .replace(/\{\{title\}\}/g, safeTitle)
    .replace(/\{\{date\}\}/g, date);
}

function seriesFrontmatter(title: string, date: string): string {
  return `---
title: ${dq(title)}
excerpt: ${dq(`A description for ${title}.`)}
date: ${dq(date)}
coverImage: ""
---

Welcome to the ${title} series.
`;
}

function noteFrontmatter(title: string, date: string): string {
  return `---
title: ${dq(title)}
date: ${dq(date)}
tags: []
aliases: []
---

`;
}

function bookFrontmatter(title: string, date: string, author: string): string {
  return `---
title: ${dq(title)}
excerpt: ${dq(`A description for ${title}.`)}
date: ${dq(date)}
coverImage: ""
featured: false
draft: false
authors:
  - ${author}
chapters: []
---

Welcome to ${title}.
`;
}

function chapterFrontmatter(title: string): string {
  return `---
title: ${dq(title)}
excerpt: ""
---

`;
}

function pageFrontmatter(title: string, date: string): string {
  return `---
title: ${dq(title)}
date: ${dq(date)}
---

`;
}

function genericFrontmatter(title: string, date: string): string {
  return `---\ntitle: ${dq(title)}\ndate: ${date}\ndraft: true\n---\n`;
}

/** Resolve the on-disk path, directories to create, and file contents for a
 *  new content entry, mirroring the Amytis `new-*` scripts. */
export function buildNewContent(input: ScaffoldInput): ScaffoldOutput {
  const { kind, title, date, contentRoot, basePath, dirPath } = input;
  const slug = slugify(title);

  switch (kind) {
    case "post": {
      const dir = `${contentRoot}/${basePath}`;
      return {
        dirsToCreate: [dir],
        filePath: `${dir}/${date}-${slug}.mdx`,
        content: renderPostTemplate(input.postTemplate, title, date),
      };
    }
    case "seriesPost": {
      // A member post inside an existing series folder — no date prefix.
      return {
        dirsToCreate: [dirPath],
        filePath: `${dirPath}/${slug}.mdx`,
        content: renderPostTemplate(input.postTemplate, title, date),
      };
    }
    case "series": {
      const dir = `${contentRoot}/series/${slug}`;
      return {
        dirsToCreate: [dir, `${dir}/images`],
        filePath: `${dir}/index.mdx`,
        content: seriesFrontmatter(title, date),
      };
    }
    case "book": {
      const dir = `${contentRoot}/books/${slug}`;
      return {
        dirsToCreate: [dir, `${dir}/images`],
        filePath: `${dir}/index.mdx`,
        content: bookFrontmatter(title, date, input.defaultAuthor || "Amytis"),
      };
    }
    case "chapter": {
      return {
        dirsToCreate: [dirPath],
        filePath: `${dirPath}/${slug}.mdx`,
        content: chapterFrontmatter(title),
      };
    }
    case "note": {
      const dir = `${contentRoot}/notes`;
      return {
        dirsToCreate: [dir],
        filePath: `${dir}/${slug}.mdx`,
        content: noteFrontmatter(title, date),
      };
    }
    case "page": {
      return {
        dirsToCreate: [contentRoot],
        filePath: `${contentRoot}/${slug}.mdx`,
        content: pageFrontmatter(title, date),
      };
    }
    default: {
      // "generic" / "flow" (flow is created via the today's-flow path, not here)
      return {
        dirsToCreate: [dirPath],
        filePath: `${dirPath}/${slug}.md`,
        content: genericFrontmatter(title, date),
      };
    }
  }
}
