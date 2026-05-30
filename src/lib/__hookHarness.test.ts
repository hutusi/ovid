// Smoke test: proves the @testing-library/react + happy-dom + bun:test
// harness wired in by ADR 0012 works end to end. The hook under test is
// a trivial in-file counter; this file exists only as a tripwire so a
// broken harness surfaces immediately rather than in the middle of a real
// hook test. Safe to delete once richer hook tests have been in tree for
// a while.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  return { count, increment };
}

describe("hook test harness", () => {
  it("renderHook returns the hook's initial state", () => {
    const { result } = renderHook(() => useCounter(3));
    expect(result.current.count).toBe(3);
  });

  it("state updates inside act() are reflected on result.current", () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(1);
  });
});
