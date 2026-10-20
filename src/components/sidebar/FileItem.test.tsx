import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, render } from "@testing-library/react";
import { localT } from "../../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import type { FileNode, GitStatus } from "../../lib/types";

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: localT, i18n: { language: "en" } }),
}));

const { FileItem } = await import("./FileItem");

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

const noop = () => {};

/** Counts lookups — the row reads its file's git status once per render, so
 *  this counts the row's renders without mocking any module. */
class CountingStatusMap extends Map<string, GitStatus> {
  lookups = 0;
  override get(key: string) {
    this.lookups += 1;
    return super.get(key);
  }
}
const statusMap = new CountingStatusMap();
const node: FileNode = { name: "a.md", path: "/ws/a.md", isDirectory: false, extension: ".md" };
const stableProps = {
  node,
  depth: 0,
  isExpanded: () => false,
  onToggleExpand: noop,
  selectedPath: null,
  gitStatusMap: statusMap,
  gitRollup: new Map<string, GitStatus>(),
  filesMode: false,
  onSelect: noop,
  onNewFile: noop,
  onNewTodayFlow: noop,
  onAddToCollection: noop,
  onRemoveFromCollection: noop,
  onRename: noop,
  onDuplicate: noop,
  onNewFromExisting: noop,
  onDelete: noop,
};

describe("FileItem", () => {
  it("skips re-rendering when its props are unchanged", () => {
    statusMap.lookups = 0;
    const row = (selectedPath: string | null) => (
      <FileItem {...stableProps} selectedPath={selectedPath} />
    );
    const view = render(row(null));
    const afterMount = statusMap.lookups;
    expect(afterMount).toBeGreaterThan(0);

    // A parent re-render with identical props: the memoized row bails out.
    act(() => view.rerender(row(null)));
    expect(statusMap.lookups).toBe(afterMount);

    // Selecting it does re-render it.
    act(() => view.rerender(row("/ws/a.md")));
    expect(statusMap.lookups).toBeGreaterThan(afterMount);
    expect(view.container.querySelector(".sidebar-file-row.selected")).not.toBeNull();
    act(() => view.unmount());
  });
});
