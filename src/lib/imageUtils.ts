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
 * If `absolutePath` lives inside `assetRoot`, return the root-relative path
 * (always starts with `/`). Otherwise return `null`.
 *
 * Used to skip copying an image into the active file's `images/` directory
 * when the user picks something already inside the workspace's static asset
 * root (typically `<workspace>/public/`); the existing path can be referenced
 * directly via a root-relative URL.
 *
 * Both inputs must use forward slashes. Trailing slashes on `assetRoot` are
 * tolerated. The match requires a directory boundary, so a sibling like
 * `/foo/public-other/x.png` is correctly rejected against `/foo/public`.
 */
export function toAssetRootRelative(
  absolutePath: string,
  assetRoot: string | undefined
): string | null {
  if (!assetRoot) return null;
  const root = assetRoot.replace(/\/+$/, "");
  if (!root || !absolutePath.startsWith(`${root}/`)) return null;
  return absolutePath.slice(root.length);
}

/**
 * Resolve the file extension to use when saving an image.
 * Prefers the MIME-derived extension since the bytes determine the actual format
 * (a `.png` filename can wrap JPEG bytes). Falls back to the filename extension
 * when MIME is missing or non-image, then to a final default.
 */
export function resolveImageExtension(file: { name: string; type: string }): string {
  const mimeExt = file.type ? mimeTypeToImageExtension(file.type) : "";
  if (mimeExt && ALLOWED_IMAGE_EXTENSIONS.has(mimeExt)) return mimeExt;

  const candidate = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (candidate && ALLOWED_IMAGE_EXTENSIONS.has(candidate)) return candidate;

  return mimeExt || "png";
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
