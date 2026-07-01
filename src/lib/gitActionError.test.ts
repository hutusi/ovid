import { describe, expect, it } from "bun:test";
import { localT } from "../../scripts/test-i18n-mock";
import { formatGitActionError, getErrorMessage } from "./gitActionError";

describe("gitActionError", () => {
  it("formatGitActionError preserves already classified backend messages", () => {
    expect(formatGitActionError("push", "Push rejected. Remote has new commits.", localT)).toBe(
      "Push rejected. Remote has new commits."
    );
  });

  it("formatGitActionError prefixes unclassified messages", () => {
    expect(formatGitActionError("pull", "fatal: test failure", localT)).toBe(
      "pull failed: fatal: test failure"
    );
  });

  it("getErrorMessage normalizes Error instances", () => {
    expect(getErrorMessage(new Error("fatal: bad path"))).toBe("fatal: bad path");
  });

  it("getErrorMessage stringifies non-Error values", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
  });
});
