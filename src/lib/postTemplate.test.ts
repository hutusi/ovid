import { describe, expect, test } from "bun:test";
import { createPostFromExistingContent } from "./postTemplate";

describe("createPostFromExistingContent", () => {
  test("returns an empty file when the source has no frontmatter", () => {
    expect(createPostFromExistingContent("# Hello\n")).toBe("");
  });

  test("resets known post metadata fields and clears the body", () => {
    const raw = `---
title: Hello World
date: 2024-01-15
draft: false
featured: true
pinned: true
coverImage: /cover.jpg
slug: hello-world
tags:
  - writing
  - notes
type: post
series: weekly-notes
---
Body text
`;

    expect(createPostFromExistingContent(raw, new Date(2026, 3, 26))).toBe(`---
title: ''
date: 2026-04-26
draft: true
featured: false
pinned: false
coverImage: ''
slug: ''
tags: []
type: post
series: weekly-notes
---
`);
  });

  test("keeps nested fields and timestamps it doesn't reset", () => {
    const raw = `---
title: Hello
date: 2024-01-15T09:30:00+08:00
updated: 2024-02-01
seo:
  description: About hello
authors:
  - name: Ada
---
Body
`;
    expect(createPostFromExistingContent(raw, new Date(2026, 3, 26))).toBe(`---
title: ''
date: 2026-04-26
updated: 2024-02-01
seo:
  description: About hello
authors:
  - name: Ada
---
`);
  });

  test("preserves unsupported or malformed frontmatter blocks exactly", () => {
    const raw = `---
: bad: yaml: [
---
Body
`;

    expect(createPostFromExistingContent(raw)).toBe(`---
: bad: yaml: [
---
`);
  });
});
