import { convertFileSrc } from "@tauri-apps/api/core";

export const ALLOWED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
]);

/**
 * Convert an image MIME type to a lowercase file extension.
 * Handles parameterized types (e.g. "image/png; charset=utf-8"),
 * `image/svg+xml` → `svg`, and `image/jpeg` → `jpg`.
 */
export function mimeTypeToImageExtension(mimeType: string): string {
  if (!mimeType.includes("/")) return "png";
  const rawSubtype = mimeType.split("/")[1] ?? "";
  const subtype = rawSubtype.split(";")[0].trim();
  if (!subtype) return "png";
  if (subtype === "svg+xml") return "svg";
  if (subtype === "jpeg") return "jpg";
  return subtype;
}

/**
 * Resolve the file extension to use when saving an image.
 * Prefers a recognized extension from the filename; falls back to the
 * extension derived from the MIME type when the filename has no usable extension
 * (e.g. clipboard pastes, where `name` is often empty).
 */
export function resolveImageExtension(file: { name: string; type: string }): string {
  const candidate = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (candidate && ALLOWED_IMAGE_EXTENSIONS.has(candidate)) return candidate;
  return mimeTypeToImageExtension(file.type);
}

export function resolveRelativePath(baseDir: string, relative: string): string {
  const parts = baseDir.split("/");
  for (const seg of relative.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Resolve an image `src` attribute to a URL usable in Tauri's WebView.
 *
 * - External / data / blob / asset URLs pass through unchanged.
 * - Root-relative paths (/images/foo.png): prepend CDN base if configured,
 *   otherwise resolve against `assetRoot` (workspace's public/ dir or root).
 * - Relative paths (../assets/foo.png): resolve against `filePath`'s directory.
 *
 * `toFileUrl` defaults to Tauri's `convertFileSrc`; pass a custom function
 * in tests to avoid a Tauri runtime dependency.
 */
export function resolveImageSrc(
  src: string,
  filePath: string | undefined,
  assetRoot: string | undefined,
  cdnBase: string | undefined,
  toFileUrl: (path: string) => string = convertFileSrc
): string {
  if (!src) return src;
  if (/^(https?|data|blob|asset):/.test(src)) return src;

  if (src.startsWith("/")) {
    if (cdnBase) return `${cdnBase.replace(/\/$/, "")}${src}`;
    if (assetRoot) return toFileUrl(`${assetRoot}${src}`);
    return src;
  }

  if (filePath) {
    const slashIdx = filePath.lastIndexOf("/");
    const dir = slashIdx >= 0 ? filePath.substring(0, slashIdx) : ".";
    return toFileUrl(resolveRelativePath(dir, src));
  }

  return src;
}
