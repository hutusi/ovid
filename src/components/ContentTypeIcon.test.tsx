import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentTypeIcon } from "./ContentTypeIcon";

function iconNameFor(type: string | undefined): string {
  const html = renderToStaticMarkup(<ContentTypeIcon type={type} size={13} className="x" />);
  const match = html.match(/class="lucide lucide-([\w-]+)/);
  return match?.[1] ?? "<none>";
}

describe("ContentTypeIcon", () => {
  it("maps each known content type to a distinct Lucide icon", () => {
    expect(iconNameFor("post")).toBe("file-text");
    expect(iconNameFor("flow")).toBe("arrow-left-right");
    expect(iconNameFor("series")).toBe("list-ordered");
    expect(iconNameFor("book")).toBe("book-open");
    expect(iconNameFor("page")).toBe("layout-template");
    expect(iconNameFor("note")).toBe("sticky-note");
  });

  it("falls back to the generic File icon for unknown or missing types", () => {
    expect(iconNameFor(undefined)).toBe("file");
    expect(iconNameFor("collection")).toBe("file");
  });
});
