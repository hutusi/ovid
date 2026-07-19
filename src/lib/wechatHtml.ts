import MarkdownIt from "markdown-it";
// markdown-it-task-lists ships without bundled .d.ts; the runtime API is just
// `(md: MarkdownIt) => void`, which is all we need.
// @ts-expect-error -- no types published; treat as plain plugin function
import taskLists from "markdown-it-task-lists";
import { hasMathBlocks } from "./wechatMarkdownAnalysis";

// Inline styles applied to each HTML tag for WeChat compatibility.
// WeChat Official Account articles must use inline styles; external CSS is stripped.
const TAG_STYLES = {
  p: "margin: 0 0 1.2em; padding: 0; line-height: 1.75; font-size: 16px; color: #333333;",
  h1: "font-size: 1.6em; font-weight: bold; line-height: 1.4; color: #1a1a1a; margin: 1.4em 0 0.6em; padding: 0;",
  h2: "font-size: 1.4em; font-weight: bold; line-height: 1.4; color: #1a1a1a; margin: 1.2em 0 0.5em; padding-left: 10px; border-left: 4px solid #576b95;",
  h3: "font-size: 1.2em; font-weight: bold; line-height: 1.4; color: #222222; margin: 1.1em 0 0.4em; padding: 0;",
  h4: "font-size: 1.1em; font-weight: bold; line-height: 1.4; color: #222222; margin: 1em 0 0.4em; padding: 0;",
  h5: "font-size: 1.05em; font-weight: bold; line-height: 1.4; color: #333333; margin: 0.9em 0 0.3em; padding: 0;",
  h6: "font-size: 1em; font-weight: bold; line-height: 1.4; color: #555555; margin: 0.9em 0 0.3em; padding: 0;",
  blockquote:
    "border-left: 4px solid #d1d5db; padding: 0.5em 1em; margin: 1em 0; color: #6b7280; background: #f9fafb;",
  pre: "background: #1e1e1e; color: #d4d4d4; padding: 1em 1.2em; border-radius: 6px; margin: 1em 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;",
  ul: "padding-left: 1.8em; margin: 0.8em 0;",
  ol: "padding-left: 1.8em; margin: 0.8em 0;",
  li: "margin: 0.3em 0; line-height: 1.75; font-size: 16px; color: #333333;",
  img: "max-width: 100%; height: auto; display: block; margin: 1em auto;",
  a: "color: #576b95; text-decoration: none;",
  hr: "border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0;",
  table: "border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 15px;",
  th: "border: 1px solid #d1d5db; padding: 8px 12px; background: #f3f4f6; font-weight: bold; text-align: left;",
  td: "border: 1px solid #d1d5db; padding: 8px 12px; line-height: 1.6;",
  strong: "font-weight: bold;",
  em: "font-style: italic;",
  s: "text-decoration: line-through;",
  code: "font-family: 'Courier New', Courier, monospace; font-size: 0.875em; background: #f6f8fa; padding: 2px 5px; border-radius: 3px; color: #e83e8c;",
} as const;

// Inline style for <code> inside <pre> — overrides the inline-code style so
// fenced code blocks render against the dark <pre> background instead of the
// pink-on-grey treatment used for inline `code`.
const PRE_CODE_STYLE =
  "font-family: 'Courier New', Courier, monospace; font-size: 14px; background: transparent; padding: 0; border-radius: 0; color: inherit; white-space: inherit;";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** WeChat strips `white-space` from inline styles, so a literal `\n` inside
 *  `<pre><code>` collapses to a single space. Replace each newline with a
 *  `<br>` so line breaks survive the round-trip through the WeChat editor. */
function newlinesToBr(escapedCode: string): string {
  return escapedCode.replace(/\r?\n/g, "<br>");
}

function isAbsoluteHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function mergeCellStyle(base: string, align: string | null): string {
  if (!align) return base;
  return `${base}${base.endsWith(";") ? " " : "; "}${align}`;
}

function buildMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    breaks: false,
    typographer: false,
  });
  md.use(taskLists, { enabled: true, label: false, lineNumber: false });

  // Pre-styled block elements — every renderer rule below ignores any classes
  // or attrs that plugins or input may have attached, since WeChat strips
  // class= and id= regardless. This guarantees a clean attribute surface.
  md.renderer.rules.heading_open = (tokens, idx) => {
    const tag = tokens[idx].tag as keyof typeof TAG_STYLES;
    return `<${tag} style="${TAG_STYLES[tag]}">`;
  };
  md.renderer.rules.paragraph_open = () => `<p style="${TAG_STYLES.p}">`;
  md.renderer.rules.bullet_list_open = () => `<ul style="${TAG_STYLES.ul}">`;
  md.renderer.rules.ordered_list_open = (tokens, idx) => {
    // markdown-it sets `start` on the token when the source is e.g. `5.` —
    // dropping the attr would silently renumber the list from 1 in WeChat.
    // attrGet returns the raw value (number when set by the parser), so
    // String-coerce before escaping.
    const start = tokens[idx].attrGet("start");
    const startAttr = start != null ? ` start="${escapeHtml(String(start))}"` : "";
    return `<ol${startAttr} style="${TAG_STYLES.ol}">`;
  };
  md.renderer.rules.list_item_open = () => `<li style="${TAG_STYLES.li}">`;
  md.renderer.rules.blockquote_open = () => `<blockquote style="${TAG_STYLES.blockquote}">`;
  md.renderer.rules.hr = () => `<hr style="${TAG_STYLES.hr}">`;
  md.renderer.rules.table_open = () => `<table style="${TAG_STYLES.table}">`;
  // Table cells: markdown-it encodes column alignment as an inline `style`
  // attr on the token (e.g. `text-align:right`). Append it to the cell's
  // base style so alignment markers in the source survive the round-trip.
  md.renderer.rules.th_open = (tokens, idx) =>
    `<th style="${mergeCellStyle(TAG_STYLES.th, tokens[idx].attrGet("style"))}">`;
  md.renderer.rules.td_open = (tokens, idx) =>
    `<td style="${mergeCellStyle(TAG_STYLES.td, tokens[idx].attrGet("style"))}">`;
  md.renderer.rules.em_open = () => `<em style="${TAG_STYLES.em}">`;
  md.renderer.rules.strong_open = () => `<strong style="${TAG_STYLES.strong}">`;
  md.renderer.rules.s_open = () => `<s style="${TAG_STYLES.s}">`;

  // Inline code: pink-on-grey badge.
  md.renderer.rules.code_inline = (tokens, idx) =>
    `<code style="${TAG_STYLES.code}">${escapeHtml(tokens[idx].content)}</code>`;

  // Fenced and indented code blocks share the same dark <pre> + transparent
  // <code> styling. Both must replace literal \n with <br> for WeChat.
  const renderCodeBlock = (content: string) =>
    `<pre style="${TAG_STYLES.pre}"><code style="${PRE_CODE_STYLE}">${newlinesToBr(escapeHtml(content))}</code></pre>`;
  md.renderer.rules.fence = (tokens, idx) => renderCodeBlock(tokens[idx].content);
  md.renderer.rules.code_block = (tokens, idx) => renderCodeBlock(tokens[idx].content);

  // Links: drop href entirely when not absolute http(s) — WeChat returns
  // error 45166 for relative or root-relative hrefs. The link tag stays
  // around so the visible label survives.
  md.renderer.rules.link_open = (tokens, idx) => {
    const hrefAttr = tokens[idx].attrGet("href") ?? "";
    if (!isAbsoluteHttpUrl(hrefAttr)) return `<a style="${TAG_STYLES.a}">`;
    return `<a href="${escapeHtml(hrefAttr)}" style="${TAG_STYLES.a}">`;
  };

  // Images: forward src/alt verbatim and add the responsive style. The
  // publish backend rewrites src to the WeChat CDN URL after upload.
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx];
    const src = token.attrGet("src") ?? "";
    const alt = token.content || token.attrGet("alt") || "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="${TAG_STYLES.img}">`;
  };

  return md;
}

const markdownRenderer = buildMarkdownRenderer();

/** Replace markdown-it-task-lists' `<input type="checkbox">` output with
 *  Unicode check glyphs. WeChat strips `<input>` entirely, which would leave
 *  task lists without their checkboxes. Done as a post-render pass because
 *  the plugin emits the checkbox via `html_inline` tokens (i.e. it bypasses
 *  the renderer-rule path); a regex sweep is the simplest stable hook.
 *
 *  Single-pass replacement so attribute order doesn't matter (`checked` may
 *  appear before or after `type="checkbox"` depending on the plugin version). */
function convertTaskCheckboxes(html: string): string {
  return html.replace(/<input([^>]*)>\s*/g, (match, attrs: string) => {
    // Don't anchor with a trailing \b — markdown-it-task-lists writes attrs
    // without separating whitespace (e.g. `checked=""type="checkbox"`), so the
    // boundary after the closing quote can fall between two non-word chars
    // and fail to match.
    if (!/type="checkbox"/.test(attrs)) return match;
    return /\bchecked\b/.test(attrs) ? "☑ " : "☐ ";
  });
}

/**
 * Converts a markdown string to WeChat-compatible inline-styled HTML.
 * Math blocks ($$...$$) are stripped with a warning since WeChat cannot render LaTeX.
 *
 * Pure string transform — no DOM, no Tiptap, safe to call anywhere. The
 * markdown-it renderer is configured with custom rules that emit pre-styled
 * HTML directly, so there is no separate styling pass to drift from.
 */
export function markdownToWechatHtml(markdown: string): {
  html: string;
  hasMath: boolean;
} {
  const hasMath = hasMathBlocks(markdown);

  const cleaned = hasMath
    ? markdown.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/\$(?!\d)[^$\n]+\$/g, "")
    : markdown;

  const rendered = markdownRenderer.render(cleaned);
  const html = convertTaskCheckboxes(rendered);
  return { html, hasMath };
}
