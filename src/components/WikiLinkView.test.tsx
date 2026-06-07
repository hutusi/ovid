import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, fireEvent, render } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

// We intentionally do NOT call `afterEach(cleanup)` from @testing-library —
// it iterates over a process-wide mount registry and trips a "node is not a
// child" error when other component-tests in the suite have manipulated
// document.body in between. Each test owns its own root + container, and
// React/the GC reclaim them when the test function returns. This mirrors
// the pattern in `WorkspaceSwitcher.test.tsx`.

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import type { ResolvedWikiTarget } from "../lib/wikiLink";
import { WikiLinkView } from "./WikiLinkView";

// Minimal NodeViewProps stand-in — the view only reads `node.attrs.{target,displayText}`,
// `extension.options`, and `selected`. The other NodeViewProps fields aren't touched.
function makeProps(args: {
  target: string;
  displayText?: string | null;
  onOpen?: (target: string, displayText: string | null) => void;
  resolve?: (target: string) => ResolvedWikiTarget;
  selected?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: deliberately shallow Tiptap mock.
}): any {
  return {
    node: {
      attrs: { target: args.target, displayText: args.displayText ?? null },
    },
    extension: {
      options: { onOpen: args.onOpen, resolve: args.resolve, className: "wiki-link" },
    },
    selected: args.selected ?? false,
    getPos: () => 0,
    updateAttributes: () => true,
    deleteNode: () => {},
    decorations: [],
    innerDecorations: [],
    HTMLAttributes: {},
    view: {},
    editor: {},
  };
}

function findAnchor(container: HTMLElement): HTMLAnchorElement {
  const a = container.querySelector("a");
  if (!a) throw new Error("anchor not found");
  return a;
}

describe("WikiLinkView", () => {
  it("renders the target text when there is no piped display", () => {
    const { container } = render(<WikiLinkView {...makeProps({ target: "Hello World" })} />);
    expect(findAnchor(container).textContent).toBe("Hello World");
  });

  it("renders the displayText when piped form is used", () => {
    const { container } = render(
      <WikiLinkView {...makeProps({ target: "Long Title", displayText: "short" })} />
    );
    expect(findAnchor(container).textContent).toBe("short");
  });

  it("applies the unresolved class when the resolver reports `exists: false`", () => {
    const { container } = render(
      <WikiLinkView
        {...makeProps({
          target: "Missing",
          resolve: () => ({ relativePath: "notes/missing.md", exists: false }),
        })}
      />
    );
    expect(findAnchor(container).className).toContain("wiki-link-unresolved");
  });

  it("omits the unresolved class when the resolver reports `exists: true`", () => {
    const { container } = render(
      <WikiLinkView
        {...makeProps({
          target: "Hello",
          resolve: () => ({ relativePath: "notes/hello.md", exists: true }),
        })}
      />
    );
    expect(findAnchor(container).className).not.toContain("wiki-link-unresolved");
  });

  it("calls onOpen with the target on click", () => {
    const onOpen = mock(() => {});
    const { container } = render(<WikiLinkView {...makeProps({ target: "Hello", onOpen })} />);
    act(() => {
      fireEvent.click(findAnchor(container));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("Hello", null);
  });

  it("forwards the displayText to onOpen when piped form is used", () => {
    const onOpen = mock(() => {});
    const { container } = render(
      <WikiLinkView {...makeProps({ target: "Hello", displayText: "hi", onOpen })} />
    );
    act(() => {
      fireEvent.click(findAnchor(container));
    });
    expect(onOpen).toHaveBeenCalledWith("Hello", "hi");
  });

  it("activates on Enter and Space (keyboard parity with click)", () => {
    const onOpen = mock(() => {});
    const { container } = render(<WikiLinkView {...makeProps({ target: "Hello", onOpen })} />);
    const anchor = findAnchor(container);
    act(() => {
      fireEvent.keyDown(anchor, { key: "Enter" });
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.keyDown(anchor, { key: " " });
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("ignores other keys", () => {
    const onOpen = mock(() => {});
    const { container } = render(<WikiLinkView {...makeProps({ target: "Hello", onOpen })} />);
    act(() => {
      fireEvent.keyDown(findAnchor(container), { key: "a" });
      fireEvent.keyDown(findAnchor(container), { key: "Tab" });
    });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
