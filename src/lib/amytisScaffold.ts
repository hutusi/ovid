// Mirrors Amytis's content-scaffolding scripts (scripts/new-*.ts) so files
// created in Ovid match what `bun run new-*` would produce: folder layout,
// `.mdx`/`.md` extension, date-prefixed posts, and per-type frontmatter.
// Amytis derives a file's content type from its folder, so none of these
// templates write a `type:` field.
//
// Body and excerpt placeholders are localized via `t` so a user in zh-CN
// mode gets Chinese seed content. YAML field VALUES (category, authors,
// layout) stay English because Amytis filters/groups on those downstream.

type Translate = (key: string, vars?: Record<string, unknown>) => string;

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

/** File extension for new content. Amytis defaults to `.mdx`. */
export type ContentFormat = "md" | "mdx";

/** Whether a flat content entry is a single file or a folder with `index.*`. */
export type ContentLayout = "file" | "folder";

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
  /** Extension for the new file. Defaults to `mdx` (Amytis behavior). `generic`/`flow` always use `md`. */
  format?: ContentFormat;
  /** File vs folder layout for flat post-like kinds. Defaults to `file`. `series`/`book` are always folder-based. */
  layout?: ContentLayout;
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

{{body}}
`;

function renderPostTemplate(
  template: string | undefined,
  title: string,
  date: string,
  t: Translate
): string {
  const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // {{body}} is only present in the built-in DEFAULT_POST_TEMPLATE; user
  // workspace templates (templates/default.mdx) own their body text and are
  // rendered verbatim — leaving the no-op `{{body}}` replace safe either way.
  return (template ?? DEFAULT_POST_TEMPLATE)
    .replace(/\{\{title\}\}/g, safeTitle)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{body\}\}/g, t("scaffold.post_body"));
}

function seriesFrontmatter(title: string, date: string, t: Translate): string {
  return `---
title: ${dq(title)}
excerpt: ${dq(t("scaffold.excerpt_placeholder", { title }))}
date: ${dq(date)}
coverImage: ""
---

${t("scaffold.series_body", { title })}
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

function bookFrontmatter(title: string, date: string, author: string, t: Translate): string {
  return `---
title: ${dq(title)}
excerpt: ${dq(t("scaffold.excerpt_placeholder", { title }))}
date: ${dq(date)}
coverImage: ""
featured: false
draft: false
authors:
  - ${author}
chapters: []
---

${t("scaffold.book_body", { title })}
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

/** Build a flat post-like entry as either a single `<dir>/<name>.<ext>` file or
 *  a `<dir>/<name>/index.<ext>` folder (with a co-located `images/` dir). */
function flatEntry(
  dir: string,
  name: string,
  ext: ContentFormat,
  layout: ContentLayout,
  content: string
): ScaffoldOutput {
  if (layout === "folder") {
    const folder = `${dir}/${name}`;
    return {
      dirsToCreate: [folder, `${folder}/images`],
      filePath: `${folder}/index.${ext}`,
      content,
    };
  }
  return { dirsToCreate: [dir], filePath: `${dir}/${name}.${ext}`, content };
}

/** Resolve the on-disk path, directories to create, and file contents for a
 *  new content entry, mirroring the Amytis `new-*` scripts. The `format` and
 *  `layout` inputs let the user opt out of the Amytis defaults (`mdx`/`file`);
 *  `generic`/`flow` stay plain `.md` files and `series`/`book` stay folder-based.
 *  `t` localizes only body and excerpt seed text — YAML values stay English. */
export function buildNewContent(input: ScaffoldInput, t: Translate): ScaffoldOutput {
  const { kind, title, date, contentRoot, basePath, dirPath } = input;
  const slug = slugify(title);
  const ext: ContentFormat = input.format ?? "mdx";
  const layout: ContentLayout = input.layout ?? "file";

  switch (kind) {
    case "post": {
      const dir = `${contentRoot}/${basePath}`;
      return flatEntry(
        dir,
        `${date}-${slug}`,
        ext,
        layout,
        renderPostTemplate(input.postTemplate, title, date, t)
      );
    }
    case "seriesPost": {
      // A member post inside an existing series folder — no date prefix.
      return flatEntry(
        dirPath,
        slug,
        ext,
        layout,
        renderPostTemplate(input.postTemplate, title, date, t)
      );
    }
    case "series": {
      const dir = `${contentRoot}/series/${slug}`;
      return {
        dirsToCreate: [dir, `${dir}/images`],
        filePath: `${dir}/index.${ext}`,
        content: seriesFrontmatter(title, date, t),
      };
    }
    case "book": {
      const dir = `${contentRoot}/books/${slug}`;
      return {
        dirsToCreate: [dir, `${dir}/images`],
        filePath: `${dir}/index.${ext}`,
        content: bookFrontmatter(title, date, input.defaultAuthor || "Amytis", t),
      };
    }
    case "chapter": {
      return flatEntry(dirPath, slug, ext, layout, chapterFrontmatter(title));
    }
    case "note": {
      return flatEntry(`${contentRoot}/notes`, slug, ext, layout, noteFrontmatter(title, date));
    }
    case "page": {
      return flatEntry(contentRoot, slug, ext, layout, pageFrontmatter(title, date));
    }
    default: {
      // "generic" / "flow" stay plain `.md` files (flow is created via the
      // today's-flow path, not here); format/layout do not apply.
      return {
        dirsToCreate: [dirPath],
        filePath: `${dirPath}/${slug}.md`,
        content: genericFrontmatter(title, date),
      };
    }
  }
}
