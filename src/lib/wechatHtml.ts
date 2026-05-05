import { Editor } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

// Inline styles applied to each HTML tag for WeChat compatibility.
// WeChat Official Account articles must use inline styles; external CSS is stripped.
const TAG_STYLES: Partial<Record<string, string>> = {
  p: "margin: 0 0 1.2em; padding: 0; line-height: 1.75; font-size: 16px; color: #333333;",
  h1: "font-size: 1.6em; font-weight: bold; line-height: 1.4; color: #1a1a1a; margin: 1.4em 0 0.6em; padding: 0;",
  h2: "font-size: 1.4em; font-weight: bold; line-height: 1.4; color: #1a1a1a; margin: 1.2em 0 0.5em; padding-left: 10px; border-left: 4px solid #576b95;",
  h3: "font-size: 1.2em; font-weight: bold; line-height: 1.4; color: #222222; margin: 1.1em 0 0.4em; padding: 0;",
  h4: "font-size: 1.1em; font-weight: bold; line-height: 1.4; color: #222222; margin: 1em 0 0.4em; padding: 0;",
  h5: "font-size: 1.05em; font-weight: bold; line-height: 1.4; color: #333333; margin: 0.9em 0 0.3em; padding: 0;",
  h6: "font-size: 1em; font-weight: bold; line-height: 1.4; color: #555555; margin: 0.9em 0 0.3em; padding: 0;",
  blockquote:
    "border-left: 4px solid #d1d5db; padding: 0.5em 1em; margin: 1em 0; color: #6b7280; background: #f9fafb;",
  pre: "background: #1e1e1e; color: #d4d4d4; padding: 1em 1.2em; border-radius: 6px; overflow-x: auto; margin: 1em 0; font-size: 14px; line-height: 1.6;",
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
};

// Inline style for <code> inside <pre> (overrides the default code style)
const PRE_CODE_STYLE =
  "font-family: 'Courier New', Courier, monospace; font-size: 14px; background: transparent; padding: 0; border-radius: 0; color: inherit;";

function applyStyles(el: Element, insidePre = false): void {
  const tag = el.tagName.toLowerCase();

  if (tag === "pre") {
    el.setAttribute("style", TAG_STYLES.pre ?? "");
    // Style the inner <code> block differently from inline code
    const codeChild = el.querySelector("code");
    if (codeChild) {
      codeChild.setAttribute("style", PRE_CODE_STYLE);
    }
    return; // don't recurse — the code child is already handled above
  }

  if (tag === "code" && insidePre) {
    el.setAttribute("style", PRE_CODE_STYLE);
  } else {
    const style = TAG_STYLES[tag];
    if (style) el.setAttribute("style", style);
  }

  const isNowInsidePre = insidePre || tag === "pre";
  for (const child of Array.from(el.children)) {
    applyStyles(child, isNowInsidePre);
  }
}

function applyWechatStyles(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  applyStyles(doc.body);
  return doc.body.innerHTML;
}

/**
 * Strip attributes and elements that WeChat rejects.
 *
 * - Non-absolute <a href> values stripped (WeChat only allows http/https links;
 *   relative/root-relative hrefs trigger error 45166)
 * - data-*, aria-*, id attributes removed (WeChat content whitelist forbids them)
 * - <input type="checkbox"> replaced with Unicode checkbox characters
 * - <label> wrappers unwrapped (children kept, tag discarded)
 */
function sanitizeForWechat(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Replace checkboxes with Unicode before unwrapping their labels
  for (const input of Array.from(doc.querySelectorAll('input[type="checkbox"]'))) {
    const checked = (input as HTMLInputElement).checked;
    const symbol = checked ? "☑ " : "☐ ";
    input.replaceWith(doc.createTextNode(symbol));
  }

  // Unwrap <label> elements — keep their children, discard the tag
  for (const label of Array.from(doc.querySelectorAll("label"))) {
    label.replaceWith(...Array.from(label.childNodes));
  }

  // Strip href from links that aren't absolute http/https URLs.
  // WeChat rejects relative, root-relative, and protocol-less hrefs (error 45166).
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    if (!href.startsWith("http://") && !href.startsWith("https://")) {
      a.removeAttribute("href");
    }
  }

  // Strip data-*, aria-*, and id attributes from all remaining elements
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    const toRemove: string[] = [];
    for (const { name } of Array.from(el.attributes)) {
      if (name.startsWith("data-") || name.startsWith("aria-") || name === "id") {
        toRemove.push(name);
      }
    }
    for (const name of toRemove) el.removeAttribute(name);
  }

  return doc.body.innerHTML;
}

function parseMarkdown(markdown: string): string {
  const el = document.createElement("div");
  const editor = new Editor({
    element: el,
    extensions: [StarterKit, TaskList, TaskItem, Markdown],
    content: markdown,
  });
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

/**
 * Extract a short plain-text excerpt from a markdown body for use as the
 * WeChat article digest (max 54 characters per WeChat API limit).
 * Strips markdown syntax and returns the first non-empty line of content.
 */
export function extractExcerpt(markdown: string, maxLen = 54): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, "") // fenced code blocks
    .replace(/`[^`\n]+`/g, "") // inline code
    .replace(/^\s*#{1,6}\s+/gm, "") // ATX headings
    .replace(/^>\s*/gm, "") // blockquote markers
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label text
    .replace(/[*_~]{1,2}([^*_~\n]+)[*_~]{1,2}/g, "$1") // bold/italic/strike
    .replace(/^\s*[-*+]\s+/gm, "") // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "") // ordered list markers
    .replace(/\n{2,}/g, "\n")
    .trim();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, maxLen);
  }
  return "";
}

/**
 * Returns true if the markdown contains any LaTeX math blocks ($$...$$  or $...$).
 * DOM-free — safe to call outside a browser context.
 */
export function hasMathBlocks(markdown: string): boolean {
  return /\$\$[\s\S]*?\$\$|\$(?!\d)[^$\n]+\$/.test(markdown);
}

/**
 * Counts markdown images whose source is a local path (not http/https/data:).
 * Used to warn the user how many images will be uploaded to WeChat CDN.
 * DOM-free — safe to call outside a browser context.
 */
export function countLocalImages(markdown: string): number {
  let count = 0;
  for (const [, src] of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const url = src.trim().split(/\s+/)[0];
    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("data:") &&
      !url.startsWith("asset://") &&
      !url.startsWith("blob:")
    )
      count++;
  }
  return count;
}

/**
 * Converts a markdown string to WeChat-compatible inline-styled HTML.
 * Math blocks ($$...$$) are stripped with a warning since WeChat cannot render LaTeX.
 */
export function markdownToWechatHtml(markdown: string): {
  html: string;
  hasMath: boolean;
} {
  const hasMath = hasMathBlocks(markdown);

  const cleaned = hasMath
    ? markdown.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/\$(?!\d)[^$\n]+\$/g, "")
    : markdown;

  const rawHtml = parseMarkdown(cleaned);
  const styledHtml = applyWechatStyles(rawHtml);
  const html = sanitizeForWechat(styledHtml);
  return { html, hasMath };
}
