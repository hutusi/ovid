import { describe, expect, it } from "bun:test";
import type { FileNode } from "./types";
import { computeWechatPublishData, type WechatPublishSource } from "./useWechatPublishData";

const file: FileNode = {
  name: "my-post.mdx",
  path: "/ws/content/posts/my-post.mdx",
  isDirectory: false,
  extension: ".mdx",
};

function source(overrides: Partial<WechatPublishSource> = {}): WechatPublishSource {
  return {
    selectedFile: file,
    parsedFrontmatter: {},
    workspaceRootPath: "/ws",
    defaultAuthor: null,
    pendingMarkdown: null,
    lastSavedContent: null,
    fileContent: "",
    ...overrides,
  };
}

describe("computeWechatPublishData", () => {
  it("derives baseDir from the selected file, falling back to the workspace root", () => {
    expect(computeWechatPublishData(source()).baseDir).toBe("/ws/content/posts");
    expect(computeWechatPublishData(source({ selectedFile: null })).baseDir).toBe("/ws");
    expect(
      computeWechatPublishData(source({ selectedFile: null, workspaceRootPath: null })).baseDir
    ).toBe("");
  });

  it("title prefers frontmatter, then the filename without extension", () => {
    expect(computeWechatPublishData(source({ parsedFrontmatter: { title: "Hello" } })).title).toBe(
      "Hello"
    );
    expect(computeWechatPublishData(source()).title).toBe("my-post");
    expect(computeWechatPublishData(source({ selectedFile: null })).title).toBe("");
  });

  it("author falls back from frontmatter to the site default, treating blank as missing", () => {
    expect(
      computeWechatPublishData(
        source({ parsedFrontmatter: { author: "Ada" }, defaultAuthor: "Site" })
      ).author
    ).toBe("Ada");
    expect(
      computeWechatPublishData(
        source({ parsedFrontmatter: { author: "   " }, defaultAuthor: "Site" })
      ).author
    ).toBe("Site");
    expect(computeWechatPublishData(source()).author).toBe("");
  });

  it("digest priority: excerpt → description → auto-extract from body", () => {
    expect(
      computeWechatPublishData(source({ parsedFrontmatter: { excerpt: " E ", description: "D" } }))
        .digest
    ).toBe("E");
    expect(
      computeWechatPublishData(source({ parsedFrontmatter: { description: "D" } })).digest
    ).toBe("D");
    expect(computeWechatPublishData(source({ fileContent: "Some body text here." })).digest).toBe(
      "Some body text here."
    );
  });

  it("body priority: pending edit → last saved content → fileContent", () => {
    const data = computeWechatPublishData(
      source({
        pendingMarkdown: "pending",
        lastSavedContent: "saved",
        fileContent: "mounted",
      })
    );
    expect(data.markdown).toBe("pending");

    const saved = computeWechatPublishData(
      source({ lastSavedContent: "saved", fileContent: "mounted" })
    );
    expect(saved.markdown).toBe("saved");

    const mounted = computeWechatPublishData(source({ fileContent: "mounted" }));
    expect(mounted.markdown).toBe("mounted");
  });

  it("honours an empty saved file instead of falling back to fileContent", () => {
    // Nullish (not truthy) check — an empty string save must win.
    const data = computeWechatPublishData(
      source({ lastSavedContent: "", fileContent: "stale mounted content" })
    );
    expect(data.markdown).toBe("");
  });

  it("strips frontmatter from the saved content before scanning", () => {
    const data = computeWechatPublishData(
      source({ lastSavedContent: "---\ntitle: X\n---\nBody $$x^2$$\n" })
    );
    expect(data.markdown).not.toContain("title: X");
    expect(data.hasMath).toBe(true);
  });

  it("mediaId trims whitespace and treats blank as absent", () => {
    expect(
      computeWechatPublishData(source({ parsedFrontmatter: { wechatMediaId: " m1 " } })).mediaId
    ).toBe("m1");
    expect(
      computeWechatPublishData(source({ parsedFrontmatter: { wechatMediaId: "  " } })).mediaId
    ).toBeNull();
    expect(computeWechatPublishData(source()).mediaId).toBeNull();
  });

  it("coverImagePath passes the raw frontmatter value through, empty as null", () => {
    expect(
      computeWechatPublishData(source({ parsedFrontmatter: { coverImage: "/images/c.jpg" } }))
        .coverImagePath
    ).toBe("/images/c.jpg");
    expect(
      computeWechatPublishData(source({ parsedFrontmatter: { coverImage: "" } })).coverImagePath
    ).toBeNull();
  });

  it("counts local images from the effective body", () => {
    const body = "![a](./a.png)\n![b](https://cdn.example.com/b.png)\n![c](images/c.jpg)";
    const data = computeWechatPublishData(source({ fileContent: body }));
    expect(data.imageCount).toBe(2);
  });
});
