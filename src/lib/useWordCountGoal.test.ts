import { describe, expect, it } from "bun:test";
import { normalizeGoal, parseGoal } from "./useWordCountGoal";

describe("parseGoal", () => {
  it("parses a positive integer string", () => {
    expect(parseGoal("5000")).toBe(5000);
  });

  it("returns null for missing, zero, negative, or non-numeric values", () => {
    expect(parseGoal(null)).toBeNull();
    expect(parseGoal("")).toBeNull();
    expect(parseGoal("0")).toBeNull();
    expect(parseGoal("-5")).toBeNull();
    expect(parseGoal("abc")).toBeNull();
  });

  it("rejects partial numeric parses that parseInt would silently truncate", () => {
    expect(parseGoal("123abc")).toBeNull();
    expect(parseGoal("1.5")).toBeNull();
    expect(parseGoal("1e2")).toBeNull();
    expect(parseGoal("  500  ")).toBe(500);
  });
});

describe("normalizeGoal", () => {
  it("truncates a finite positive number to an integer", () => {
    expect(normalizeGoal(5000.7)).toBe(5000);
  });

  it("clears the goal for null, zero, negative, or non-finite input", () => {
    expect(normalizeGoal(null)).toBeNull();
    expect(normalizeGoal(0)).toBeNull();
    expect(normalizeGoal(-10)).toBeNull();
    expect(normalizeGoal(Number.NaN)).toBeNull();
    expect(normalizeGoal(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("round-trips a stored, normalized goal", () => {
    const stored = String(normalizeGoal(1234.9));
    expect(parseGoal(stored)).toBe(1234);
  });
});
