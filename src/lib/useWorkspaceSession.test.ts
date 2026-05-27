import { describe, expect, it } from "bun:test";
// Re-export check: the coordinator wraps useWorkspace + useEditorSession,
// but the pure selection helpers must remain importable from
// useEditorSession so existing test files and consumers keep working.
import { selectionAfterRename, selectionShouldCloseAfterRemove } from "./useEditorSession";
import { useWorkspaceSession } from "./useWorkspaceSession";

describe("useWorkspaceSession module surface", () => {
  it("exports the coordinator hook", () => {
    expect(typeof useWorkspaceSession).toBe("function");
  });

  it("does not shadow useEditorSession's pure helpers", () => {
    // The session-side path mutation logic is exercised through
    // selectionAfterRename / selectionShouldCloseAfterRemove. Those
    // helpers must stay reachable from their original module — moving
    // them under useWorkspaceSession would break the test seam that
    // useEditorSession.test.ts depends on.
    expect(typeof selectionAfterRename).toBe("function");
    expect(typeof selectionShouldCloseAfterRemove).toBe("function");
  });
});
