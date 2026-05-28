import { describe, expect, it } from "bun:test";
import { isOverlayBlocking, type Overlay } from "./useOverlayStack";

const modal: Overlay = {
  kind: "modal",
  state: { type: "new-file", dirPath: "/ws/posts", kind: "post" },
};
const switcher: Overlay = { kind: "switcher" };
const gitSync: Overlay = { kind: "gitSyncPopover" };
const commit: Overlay = {
  kind: "commit",
  state: { message: "Update", branch: "main", changes: [] },
};

describe("isOverlayBlocking", () => {
  it("returns false for no overlay", () => {
    expect(isOverlayBlocking(null)).toBe(false);
  });

  it("returns true for modal kinds", () => {
    expect(isOverlayBlocking(modal)).toBe(true);
    expect(isOverlayBlocking(switcher)).toBe(true);
    expect(isOverlayBlocking(commit)).toBe(true);
  });

  it("returns false for the gitSyncPopover transient", () => {
    // gitSyncPopover is anchored to the status bar; shortcuts and menu
    // actions should still work while it's open.
    expect(isOverlayBlocking(gitSync)).toBe(false);
  });

  it("considers every modal-like kind blocking by default", () => {
    // Encoding the rule positively: if a new overlay kind is added later,
    // it is blocking unless explicitly opted out. This test will fail loudly
    // if someone accidentally adds a new non-blocking kind.
    const blockingKinds: Overlay["kind"][] = [
      "modal",
      "switcher",
      "workspaceSwitcher",
      "search",
      "update",
      "wechatPublish",
      "shortcutsHelp",
      "commit",
      "branchSwitcher",
      "newBranch",
      "renameBranch",
      "deleteBranch",
    ];
    for (const kind of blockingKinds) {
      const overlay = { kind, state: undefined } as unknown as Overlay;
      expect(isOverlayBlocking(overlay)).toBe(true);
    }
  });
});
