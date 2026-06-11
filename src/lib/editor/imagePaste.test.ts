import { describe, expect, it } from "bun:test";
import type { EditorView } from "@tiptap/pm/view";
import { createImageDropHandler, createImagePasteHandler, IMAGE_MIME } from "./imagePaste";

interface Insertion {
  pos: number;
  attrs: { src: string; alt: string };
  nodeSize: number;
}

function makeView({ selectionFrom = 5, docSize = 100, dropPos = 10 as number | null } = {}) {
  const insertions: Insertion[] = [];
  let dispatched = 0;
  let focused = 0;
  const tr = {
    insert(pos: number, node: { attrs: Insertion["attrs"]; nodeSize: number }) {
      insertions.push({ pos, attrs: node.attrs, nodeSize: node.nodeSize });
      return tr;
    },
  };
  const view = {
    state: {
      selection: { from: selectionFrom },
      doc: { content: { size: docSize } },
      schema: {
        nodes: {
          image: {
            create: (attrs: Insertion["attrs"]) => ({ attrs, nodeSize: 2 }),
          },
        },
      },
      tr,
    },
    focus: () => void focused++,
    dispatch: () => void dispatched++,
    posAtCoords: () => (dropPos === null ? null : { pos: dropPos }),
  } as unknown as EditorView;
  return { view, insertions, dispatched: () => dispatched, focused: () => focused };
}

function pasteEvent(files: File[]): ClipboardEvent & { prevented: () => boolean } {
  let prevented = false;
  return {
    clipboardData: { files, getData: () => "" },
    preventDefault: () => {
      prevented = true;
    },
    prevented: () => prevented,
  } as unknown as ClipboardEvent & { prevented: () => boolean };
}

function dropEvent(files: File[]): DragEvent {
  return {
    dataTransfer: { files },
    preventDefault: () => {},
    clientX: 1,
    clientY: 2,
  } as unknown as DragEvent;
}

const t = (key: string, vars?: Record<string, unknown>) => `${key}:${vars?.reason ?? ""}`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("IMAGE_MIME", () => {
  it("accepts the supported image types and rejects others", () => {
    for (const ok of ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]) {
      expect(IMAGE_MIME.test(ok)).toBe(true);
    }
    expect(IMAGE_MIME.test("text/plain")).toBe(false);
    expect(IMAGE_MIME.test("image/tiff")).toBe(false);
  });
});

describe("createImagePasteHandler", () => {
  it("returns false when the clipboard has no image files", () => {
    const { view } = makeView();
    const handler = createImagePasteHandler({
      filePath: "/ws/a.md",
      t,
      saveFromBytes: async () => "x.png",
    });
    expect(handler(view, pasteEvent([new File(["txt"], "a.txt", { type: "text/plain" })]))).toBe(
      false
    );
  });

  it("saves each image and inserts nodes with cumulative offsets", async () => {
    const savedArgs: Array<{ extension: string; activeFilePath?: string }> = [];
    const { view, insertions, dispatched, focused } = makeView({ selectionFrom: 7 });
    const handler = createImagePasteHandler({
      filePath: "/ws/post.md",
      t,
      saveFromBytes: async ({ extension, activeFilePath }) => {
        savedArgs.push({ extension, activeFilePath });
        return `images/saved-${savedArgs.length}.png`;
      },
    });
    const files = [
      new File([new Uint8Array([1, 2])], "one.png", { type: "image/png" }),
      new File([new Uint8Array([3])], "", { type: "image/jpeg" }),
    ];
    const event = pasteEvent(files);
    expect(handler(view, event)).toBe(true);
    expect((event as ReturnType<typeof pasteEvent>).prevented()).toBe(true);
    await settle();

    expect(savedArgs).toEqual([
      { extension: "png", activeFilePath: "/ws/post.md" },
      { extension: "jpg", activeFilePath: "/ws/post.md" },
    ]);
    // Insertion point captured before the async save; second node lands
    // after the first (offset += nodeSize).
    expect(insertions).toEqual([
      { pos: 7, attrs: { src: "images/saved-1.png", alt: "one.png" }, nodeSize: 2 },
      { pos: 9, attrs: { src: "images/saved-2.png", alt: "pasted-image" }, nodeSize: 2 },
    ]);
    expect(dispatched()).toBe(1);
    expect(focused()).toBe(1);
  });

  it("routes save failures to onError and still inserts the successes", async () => {
    const errors: string[] = [];
    const { view, insertions } = makeView();
    let call = 0;
    const handler = createImagePasteHandler({
      filePath: undefined,
      onError: (msg) => errors.push(msg),
      t,
      saveFromBytes: async () => {
        call++;
        if (call === 1) throw new Error("disk full");
        return "images/ok.png";
      },
    });
    const files = [
      new File([new Uint8Array([1])], "bad.png", { type: "image/png" }),
      new File([new Uint8Array([2])], "good.png", { type: "image/png" }),
    ];
    expect(handler(view, pasteEvent(files))).toBe(true);
    await settle();
    expect(errors).toEqual(["editor.paste_image_error:disk full"]);
    expect(insertions).toHaveLength(1);
    expect(insertions[0].attrs.src).toBe("images/ok.png");
  });

  it("does not dispatch when every save fails", async () => {
    const { view, insertions, dispatched } = makeView();
    const handler = createImagePasteHandler({
      filePath: undefined,
      t,
      saveFromBytes: async () => {
        throw new Error("nope");
      },
    });
    expect(
      handler(view, pasteEvent([new File([new Uint8Array([1])], "a.png", { type: "image/png" })]))
    ).toBe(true);
    await settle();
    expect(insertions).toHaveLength(0);
    expect(dispatched()).toBe(0);
  });
});

describe("createImageDropHandler", () => {
  it("returns false when the drag payload has no images", () => {
    const { view } = makeView();
    const handler = createImageDropHandler({
      filePath: undefined,
      t,
      saveFromBytes: async () => "x.png",
    });
    expect(handler(view, dropEvent([new File(["t"], "a.txt", { type: "text/plain" })]))).toBe(
      false
    );
  });

  it("inserts at the drop coordinates and strips the file extension from alt", async () => {
    const { view, insertions } = makeView({ dropPos: 42 });
    const handler = createImageDropHandler({
      filePath: "/ws/post.md",
      t,
      saveFromBytes: async () => "images/dropped.png",
    });
    expect(
      handler(
        view,
        dropEvent([new File([new Uint8Array([1])], "photo.png", { type: "image/png" })])
      )
    ).toBe(true);
    await settle();
    expect(insertions).toEqual([
      { pos: 42, attrs: { src: "images/dropped.png", alt: "photo" }, nodeSize: 2 },
    ]);
  });

  it("drops silently when the drop position cannot be resolved", async () => {
    const { view, insertions } = makeView({ dropPos: null });
    const handler = createImageDropHandler({
      filePath: undefined,
      t,
      saveFromBytes: async () => "images/x.png",
    });
    expect(
      handler(view, dropEvent([new File([new Uint8Array([1])], "a.png", { type: "image/png" })]))
    ).toBe(true);
    await settle();
    expect(insertions).toHaveLength(0);
  });
});
