import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import {
  readStoredSidebarWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_WIDTH_KEY,
} from "./sidebarWidth";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);
afterEach(() => localStorage.removeItem(SIDEBAR_WIDTH_KEY));

describe("readStoredSidebarWidth", () => {
  it("returns the stored width, clamped to the allowed range", () => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "300");
    expect(readStoredSidebarWidth()).toBe(300);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "9999");
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_MAX);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "10");
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_MIN);
  });

  it("falls back to the default when nothing usable is stored", () => {
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_DEFAULT);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "wide");
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_DEFAULT);
  });
});
