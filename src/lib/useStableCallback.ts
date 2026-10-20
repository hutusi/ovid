import { useCallback, useRef } from "react";

/** A function with a stable identity that always calls the latest `fn`.
 *
 *  For handlers passed to memoized components (the sidebar rows) that close
 *  over state and are therefore recreated each render: the child sees one
 *  identity for the component's lifetime and skips re-rendering, while every
 *  call still runs the current closure. Don't call it during render. */
export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result
): (...args: Args) => Result {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: Args) => ref.current(...args), []);
}
