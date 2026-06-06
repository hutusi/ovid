import { describe, expect, test } from "bun:test";

import { AUTH_REQUIRED_PREFIX, parseAuthRequired } from "./git";

describe("parseAuthRequired", () => {
  test("parses host and remote name when both present", () => {
    expect(parseAuthRequired("AUTH_REQUIRED|github.com|origin")).toEqual({
      host: "github.com",
      remoteName: "origin",
    });
  });

  test("preserves empty fields rather than falling back to null", () => {
    // Rust emits empty fields when it couldn't resolve them — still an auth
    // failure; the caller falls back to "the configured remote" copy.
    expect(parseAuthRequired("AUTH_REQUIRED||")).toEqual({
      host: "",
      remoteName: "",
    });
    expect(parseAuthRequired("AUTH_REQUIRED|github.com|")).toEqual({
      host: "github.com",
      remoteName: "",
    });
    expect(parseAuthRequired("AUTH_REQUIRED||origin")).toEqual({
      host: "",
      remoteName: "origin",
    });
  });

  test("returns null for messages that don't start with the marker", () => {
    expect(parseAuthRequired("Push rejected. Remote has new commits.")).toBeNull();
    expect(parseAuthRequired("")).toBeNull();
    expect(parseAuthRequired("auth_required|github.com|origin")).toBeNull();
  });

  test("exposes the marker prefix as a constant for catch-arm comparisons", () => {
    expect(AUTH_REQUIRED_PREFIX).toBe("AUTH_REQUIRED|");
  });
});
