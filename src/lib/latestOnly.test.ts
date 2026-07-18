import { describe, expect, it } from "bun:test";
import { createGenerationGuard } from "./latestOnly";

describe("createGenerationGuard", () => {
  it("keeps a captured generation current until something bumps", () => {
    const g = createGenerationGuard();
    const captured = g.current();
    expect(g.isCurrent(captured)).toBe(true);
    g.bump();
    expect(g.isCurrent(captured)).toBe(false);
  });

  it("models the stale-search scenario: an old in-flight response is dropped", () => {
    const g = createGenerationGuard();

    // Query A starts (bump on input, capture at request start).
    g.bump();
    const genA = g.current();

    // Query B supersedes it before A's response returns.
    g.bump();
    const genB = g.current();

    // A's slow response returns last — it must be rejected.
    expect(g.isCurrent(genA)).toBe(false);
    // B's response is still the latest — it applies.
    expect(g.isCurrent(genB)).toBe(true);
  });

  it("only the most recent of several supersessions remains current", () => {
    const g = createGenerationGuard();
    const gens = [g.bump(), g.bump(), g.bump()];
    expect(g.isCurrent(gens[0])).toBe(false);
    expect(g.isCurrent(gens[1])).toBe(false);
    expect(g.isCurrent(gens[2])).toBe(true);
  });
});
