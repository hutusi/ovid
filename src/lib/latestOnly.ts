// A monotonic generation guard for "only the latest async request may apply
// its result". Each time a new request supersedes the old, call `bump()`;
// each in-flight request captures `current()` at start and later checks
// `isCurrent(captured)` before committing — a superseded request's response
// is dropped. This is the extracted shape of the inline `refreshIdRef`
// (useWorkspace) and `noteResolverGenRef` (App) counters; SearchPanel uses it
// so the guard can be unit-tested without driving the DOM.

export interface GenerationGuard {
  /** Invalidate every in-flight request captured before now; returns the new
   *  current generation. */
  bump(): number;
  /** The current generation to capture at the start of a request. */
  current(): number;
  /** True when `captured` is still the current generation (nothing
   *  superseded it since). */
  isCurrent(captured: number): boolean;
}

export function createGenerationGuard(): GenerationGuard {
  let gen = 0;
  return {
    bump: () => ++gen,
    current: () => gen,
    isCurrent: (captured) => captured === gen,
  };
}
