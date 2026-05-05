import { describe, expect, it } from "bun:test";
import {
  mimeTypeToImageExtension,
  resolveImageExtension,
  resolveImageSrc,
  resolveRelativePath,
  toAssetRootRelative,
} from "./imageUtils";

// ---------------------------------------------------------------------------
// mimeTypeToImageExtension
// ---------------------------------------------------------------------------

describe("mimeTypeToImageExtension", () => {
  it("converts image/png → png", () => {
    expect(mimeTypeToImageExtension("image/png")).toBe("png");
  });

  it("converts image/jpeg → jpg", () => {
    expect(mimeTypeToImageExtension("image/jpeg")).toBe("jpg");
  });

  it("converts image/gif → gif", () => {
    expect(mimeTypeToImageExtension("image/gif")).toBe("gif");
  });

  it("converts image/webp → webp", () => {
    expect(mimeTypeToImageExtension("image/webp")).toBe("webp");
  });

  it("converts image/avif → avif", () => {
    expect(mimeTypeToImageExtension("image/avif")).toBe("avif");
  });

  it("converts image/svg+xml → svg (not svg+xml)", () => {
    expect(mimeTypeToImageExtension("image/svg+xml")).toBe("svg");
  });

  it("falls back to png when subtype is absent (no slash)", () => {
    expect(mimeTypeToImageExtension("image")).toBe("png");
  });

  it("strips parameters from parameterized MIME type", () => {
    expect(mimeTypeToImageExtension("image/png; charset=utf-8")).toBe("png");
  });

  it("handles empty subtype after slash", () => {
    expect(mimeTypeToImageExtension("image/")).toBe("png");
  });
});

// ---------------------------------------------------------------------------
// resolveImageExtension
// ---------------------------------------------------------------------------

describe("resolveImageExtension", () => {
  it("prefers MIME-derived extension when filename and MIME disagree", () => {
    expect(resolveImageExtension({ name: "cover.png", type: "image/jpeg" })).toBe("jpg");
  });

  it("uses MIME-derived extension when filename has no extension", () => {
    expect(resolveImageExtension({ name: "pasted-image", type: "image/png" })).toBe("png");
  });

  it("uses MIME-derived extension when filename is empty", () => {
    expect(resolveImageExtension({ name: "", type: "image/jpeg" })).toBe("jpg");
  });

  it("handles svg+xml MIME", () => {
    expect(resolveImageExtension({ name: "icon", type: "image/svg+xml" })).toBe("svg");
  });

  it("falls back to filename extension when MIME is missing", () => {
    expect(resolveImageExtension({ name: "Hero.WEBP", type: "" })).toBe("webp");
  });

  it("falls back to filename when MIME is non-image", () => {
    expect(resolveImageExtension({ name: "image.jpg", type: "application/octet-stream" })).toBe(
      "jpg"
    );
  });

  it("defaults to png when both MIME and filename are unusable", () => {
    expect(resolveImageExtension({ name: "weird.bin", type: "" })).toBe("png");
  });
});

// ---------------------------------------------------------------------------
// toAssetRootRelative
// ---------------------------------------------------------------------------

describe("toAssetRootRelative", () => {
  it("returns null when assetRoot is undefined", () => {
    expect(toAssetRootRelative("/workspace/public/cover.jpg", undefined)).toBeNull();
  });

  it("returns null when assetRoot is empty", () => {
    expect(toAssetRootRelative("/workspace/public/cover.jpg", "")).toBeNull();
  });

  it("returns the root-relative path for a file directly under assetRoot", () => {
    expect(toAssetRootRelative("/workspace/public/cover.jpg", "/workspace/public")).toBe(
      "/cover.jpg"
    );
  });

  it("returns the root-relative path for a nested file", () => {
    expect(toAssetRootRelative("/workspace/public/images/hero.jpg", "/workspace/public")).toBe(
      "/images/hero.jpg"
    );
  });

  it("tolerates a trailing slash on assetRoot", () => {
    expect(toAssetRootRelative("/workspace/public/cover.jpg", "/workspace/public/")).toBe(
      "/cover.jpg"
    );
  });

  it("returns null when path is outside assetRoot", () => {
    expect(
      toAssetRootRelative("/workspace/content/posts/cover.jpg", "/workspace/public")
    ).toBeNull();
  });

  it("rejects a sibling with a similar prefix (directory boundary required)", () => {
    expect(
      toAssetRootRelative("/workspace/public-other/cover.jpg", "/workspace/public")
    ).toBeNull();
  });

  it("returns null when path equals assetRoot exactly (no file segment)", () => {
    expect(toAssetRootRelative("/workspace/public", "/workspace/public")).toBeNull();
  });
});

// Stub convertFileSrc: just prefix with "file://" so we can assert on the resolved path
const toFileUrl = (p: string) => `file://${p}`;

const FILE = "/workspace/content/posts/hello.md";
const ASSET_ROOT = "/workspace/public";

// ---------------------------------------------------------------------------
// resolveRelativePath
// ---------------------------------------------------------------------------

describe("resolveRelativePath", () => {
  it("resolves a simple sibling file", () => {
    expect(resolveRelativePath("/a/b", "c.png")).toBe("/a/b/c.png");
  });

  it("resolves ../ correctly", () => {
    expect(resolveRelativePath("/a/b/c", "../img.png")).toBe("/a/b/img.png");
  });

  it("resolves multiple ../ steps", () => {
    expect(resolveRelativePath("/a/b/c/d", "../../img.png")).toBe("/a/b/img.png");
  });

  it("resolves ./ prefix", () => {
    expect(resolveRelativePath("/a/b", "./img.png")).toBe("/a/b/img.png");
  });

  it("handles nested relative path", () => {
    expect(resolveRelativePath("/workspace/content/posts", "../assets/photo.jpg")).toBe(
      "/workspace/content/assets/photo.jpg"
    );
  });
});

// ---------------------------------------------------------------------------
// resolveImageSrc — pass-through cases
// ---------------------------------------------------------------------------

describe("resolveImageSrc — pass-through", () => {
  it("returns empty string unchanged", () => {
    expect(resolveImageSrc("", FILE, ASSET_ROOT, undefined, toFileUrl)).toBe("");
  });

  it("passes through https URL", () => {
    const url = "https://example.com/img.jpg";
    expect(resolveImageSrc(url, FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(url);
  });

  it("passes through http URL", () => {
    const url = "http://example.com/img.jpg";
    expect(resolveImageSrc(url, FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(url);
  });

  it("passes through data URI", () => {
    const url = "data:image/png;base64,abc123";
    expect(resolveImageSrc(url, FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(url);
  });

  it("passes through blob URL", () => {
    const url = "blob:http://localhost/abc";
    expect(resolveImageSrc(url, FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(url);
  });

  it("passes through asset:// URL", () => {
    const url = "asset://localhost/some/path.png";
    expect(resolveImageSrc(url, FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(url);
  });
});

// ---------------------------------------------------------------------------
// resolveImageSrc — root-relative paths
// ---------------------------------------------------------------------------

describe("resolveImageSrc — root-relative", () => {
  it("resolves against assetRoot when no CDN", () => {
    expect(resolveImageSrc("/images/photo.jpg", FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(
      "file:///workspace/public/images/photo.jpg"
    );
  });

  it("prepends CDN base when configured (trailing slash stripped)", () => {
    expect(
      resolveImageSrc("/images/photo.jpg", FILE, ASSET_ROOT, "https://cdn.example.com/", toFileUrl)
    ).toBe("https://cdn.example.com/images/photo.jpg");
  });

  it("prepends CDN base without trailing slash", () => {
    expect(
      resolveImageSrc("/images/photo.jpg", FILE, ASSET_ROOT, "https://cdn.example.com", toFileUrl)
    ).toBe("https://cdn.example.com/images/photo.jpg");
  });

  it("CDN takes priority over assetRoot", () => {
    const result = resolveImageSrc(
      "/img.png",
      FILE,
      ASSET_ROOT,
      "https://cdn.example.com",
      toFileUrl
    );
    expect(result).toBe("https://cdn.example.com/img.png");
    expect(result).not.toContain("file://");
  });

  it("returns src unchanged when no assetRoot and no CDN", () => {
    expect(resolveImageSrc("/images/photo.jpg", FILE, undefined, undefined, toFileUrl)).toBe(
      "/images/photo.jpg"
    );
  });
});

// ---------------------------------------------------------------------------
// resolveImageSrc — relative paths
// ---------------------------------------------------------------------------

describe("resolveImageSrc — relative paths", () => {
  it("resolves path relative to file's directory", () => {
    expect(resolveImageSrc("../assets/photo.jpg", FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(
      "file:///workspace/content/assets/photo.jpg"
    );
  });

  it("resolves ./ prefix relative to file's directory", () => {
    expect(resolveImageSrc("./photo.jpg", FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(
      "file:///workspace/content/posts/photo.jpg"
    );
  });

  it("resolves bare filename relative to file's directory", () => {
    expect(resolveImageSrc("photo.jpg", FILE, ASSET_ROOT, undefined, toFileUrl)).toBe(
      "file:///workspace/content/posts/photo.jpg"
    );
  });

  it("returns src unchanged when filePath is undefined", () => {
    expect(resolveImageSrc("photo.jpg", undefined, ASSET_ROOT, undefined, toFileUrl)).toBe(
      "photo.jpg"
    );
  });

  it("handles bare filePath with no directory component", () => {
    // lastIndexOf('/') === -1 → dir falls back to '.'
    expect(resolveImageSrc("photo.jpg", "file.md", ASSET_ROOT, undefined, toFileUrl)).toBe(
      "file://./photo.jpg"
    );
  });

  it("ignores assetRoot for relative paths", () => {
    const result = resolveImageSrc("photo.jpg", FILE, ASSET_ROOT, undefined, toFileUrl);
    expect(result).not.toContain("/workspace/public");
  });
});
