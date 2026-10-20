import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, render } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import type { FileNode, GitStatus } from "../lib/types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: localT, i18n: { language: "en" } }),
}));

const { Sidebar } = await import("./Sidebar");
const { focusSidebarTree } = await import("../lib/useSidebarTreeFocus");

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

const noop = () => {};

// docs/            (depth 0, open by default)
//   a.md
//   sub/           (depth 1, closed by default)
//     c.md
// b.md
const tree: FileNode[] = [
  {
    name: "docs",
    path: "/ws/docs",
    isDirectory: true,
    children: [
      { name: "a.md", path: "/ws/docs/a.md", isDirectory: false, extension: ".md" },
      {
        name: "sub",
        path: "/ws/docs/sub",
        isDirectory: true,
        children: [
          { name: "c.md", path: "/ws/docs/sub/c.md", isDirectory: false, extension: ".md" },
        ],
      },
    ],
  },
  { name: "b.md", path: "/ws/b.md", isDirectory: false, extension: ".md" },
];

function renderSidebar(selectedPath: string | null) {
  return render(
    <Sidebar
      tree={tree}
      workspaceKey={`kbd-test-${Math.random()}`}
      selectedPath={selectedPath}
      visible
      workspaceName="ws"
      gitStatusMap={new Map<string, GitStatus>()}
      mode="files"
      onToggleMode={noop}
      onToggleVisible={noop}
      onSelect={noop}
      onOpenWorkspace={noop}
      onOpenSwitcher={noop}
      onNewFile={noop}
      onNewTodayFlow={noop}
      onAddToCollection={noop}
      onRemoveFromCollection={noop}
      onRename={noop}
      onDuplicate={noop}
      onNewFromExisting={noop}
      onDelete={noop}
    />
  );
}

function rows(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-tree-row="true"]'));
}

function row(container: HTMLElement, path: string) {
  const el = container.querySelector<HTMLElement>(`[data-tree-row="true"][data-path="${path}"]`);
  if (!el) throw new Error(`no row for ${path}`);
  return el;
}

async function press(key: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
}

describe("Sidebar keyboard", () => {
  it("keeps one row in the Tab order, starting at the open file", async () => {
    const view = renderSidebar("/ws/b.md");
    await act(async () => {});
    const tabbable = rows(view.container).filter((el) => el.tabIndex === 0);
    expect(tabbable.map((el) => el.dataset.path)).toEqual(["/ws/b.md"]);

    // Focusing another row moves the single tab stop with it.
    await act(async () => row(view.container, "/ws/docs").focus());
    const after = rows(view.container).filter((el) => el.tabIndex === 0);
    expect(after.map((el) => el.dataset.path)).toEqual(["/ws/docs"]);
    view.unmount();
  });

  it("moves with Up/Down/Home/End through the visible rows", async () => {
    const view = renderSidebar(null);
    await act(async () => row(view.container, "/ws/docs").focus());
    await press("ArrowDown");
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/docs/a.md");
    await press("End");
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/b.md");
    await press("ArrowUp");
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/docs/sub");
    await press("Home");
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/docs");
    view.unmount();
  });

  it("expands and collapses folders with Right/Left, and steps in and out", async () => {
    const view = renderSidebar(null);
    const sub = row(view.container, "/ws/docs/sub");
    expect(sub.dataset.expanded).toBe("false");

    await act(async () => sub.focus());
    await press("ArrowRight");
    expect(row(view.container, "/ws/docs/sub").dataset.expanded).toBe("true");
    expect(view.container.querySelector('[data-path="/ws/docs/sub/c.md"]')).not.toBeNull();

    await press("ArrowRight");
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/docs/sub/c.md");

    await press("ArrowLeft");
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/docs/sub");

    await press("ArrowLeft");
    expect(row(view.container, "/ws/docs/sub").dataset.expanded).toBe("false");
    expect(view.container.querySelector('[data-path="/ws/docs/sub/c.md"]')).toBeNull();
    view.unmount();
  });

  it("Cmd+0's focusSidebarTree lands on the open file's row", async () => {
    const view = renderSidebar("/ws/docs/a.md");
    await act(async () => {});
    let focused = false;
    await act(async () => {
      focused = focusSidebarTree();
    });
    expect(focused).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.path).toBe("/ws/docs/a.md");
    view.unmount();
  });
});
