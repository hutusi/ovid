import { afterEach, describe, expect, it } from "bun:test";
import { prefersReducedMotion, scrollBehavior } from "./motion";

const globalWithWindow = globalThis as { window?: unknown };
const original = globalWithWindow.window;

function stubMatchMedia(reduce: boolean) {
  globalWithWindow.window = {
    matchMedia: (query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)",
    }),
  };
}

afterEach(() => {
  globalWithWindow.window = original;
});

describe("motion", () => {
  it("scrolls smoothly unless the user asked for reduced motion", () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");

    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("treats a missing matchMedia as no preference", () => {
    globalWithWindow.window = {};
    expect(prefersReducedMotion()).toBe(false);
  });
});
