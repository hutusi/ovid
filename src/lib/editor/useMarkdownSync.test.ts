import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { useMarkdownSync } from "./useMarkdownSync";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

// The serialize delay inside the hook is 150ms; wait comfortably past it.
const DEBOUNCE_SETTLE_MS = 250;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeEditor(markdown: string): Editor {
  return {
    storage: { markdown: { getMarkdown: () => markdown } },
    state: { doc: { content: { size: markdown.length } } },
  } as unknown as Editor;
}

describe("useMarkdownSync", () => {
  it("scheduleSerialize debounces and emits the serialized markdown once", async () => {
    const changes: string[] = [];
    const { result } = renderHook(() => useMarkdownSync({ onChange: (md) => changes.push(md) }));

    act(() => {
      result.current.scheduleSerialize(makeEditor("# one"));
    });
    expect(changes).toEqual([]);

    await act(() => sleep(DEBOUNCE_SETTLE_MS));
    expect(changes).toEqual(["# one"]);
  });

  it("a re-schedule resets the timer so only the latest edit serializes", async () => {
    const changes: string[] = [];
    const { result } = renderHook(() => useMarkdownSync({ onChange: (md) => changes.push(md) }));

    act(() => {
      result.current.scheduleSerialize(makeEditor("draft 1"));
      result.current.scheduleSerialize(makeEditor("draft 2"));
    });
    await act(() => sleep(DEBOUNCE_SETTLE_MS));
    expect(changes).toEqual(["draft 2"]);
  });

  it("flushPendingSerialization emits immediately and cancels the timer", async () => {
    const changes: string[] = [];
    const { result } = renderHook(() => useMarkdownSync({ onChange: (md) => changes.push(md) }));

    act(() => {
      result.current.scheduleSerialize(makeEditor("# flushed"));
      result.current.flushPendingSerialization(makeEditor("# flushed"));
    });
    expect(changes).toEqual(["# flushed"]);

    // The cancelled timer must not fire a second serialization.
    await act(() => sleep(DEBOUNCE_SETTLE_MS));
    expect(changes).toEqual(["# flushed"]);
  });

  it("flush is a no-op when nothing is pending", () => {
    const changes: string[] = [];
    const { result } = renderHook(() => useMarkdownSync({ onChange: (md) => changes.push(md) }));

    act(() => {
      result.current.flushPendingSerialization(makeEditor("# never scheduled"));
    });
    expect(changes).toEqual([]);
  });

  it("flush falls back to the last editor seen via setCurrentEditor", () => {
    const changes: string[] = [];
    const { result } = renderHook(() => useMarkdownSync({ onChange: (md) => changes.push(md) }));

    act(() => {
      result.current.setCurrentEditor(makeEditor("# latest"));
      result.current.scheduleSerialize(makeEditor("# latest"));
      result.current.flushPendingSerialization();
    });
    expect(changes).toEqual(["# latest"]);
  });

  it("cancelPendingSerialize drops the pending emit", async () => {
    const changes: string[] = [];
    const { result } = renderHook(() => useMarkdownSync({ onChange: (md) => changes.push(md) }));

    act(() => {
      result.current.scheduleSerialize(makeEditor("# cancelled"));
      result.current.cancelPendingSerialize();
    });
    await act(() => sleep(DEBOUNCE_SETTLE_MS));
    expect(changes).toEqual([]);
  });

  it("unmount flushes a pending serialization so a fast file-switch can't drop it", () => {
    const changes: string[] = [];
    const { result, unmount } = renderHook(() =>
      useMarkdownSync({ onChange: (md) => changes.push(md) })
    );

    act(() => {
      result.current.setCurrentEditor(makeEditor("# trailing edit"));
      result.current.scheduleSerialize(makeEditor("# trailing edit"));
    });
    unmount();
    expect(changes).toEqual(["# trailing edit"]);
  });

  it("wires registerPendingFlush with a working flush and unregisters on unmount", () => {
    const registered: Array<() => void> = [];
    let unregistered = 0;
    const changes: string[] = [];
    const { result, unmount } = renderHook(() =>
      useMarkdownSync({
        onChange: (md) => changes.push(md),
        registerPendingFlush: (flush) => {
          registered.push(flush);
          return () => {
            unregistered += 1;
          };
        },
      })
    );

    expect(registered).toHaveLength(1);

    act(() => {
      result.current.setCurrentEditor(makeEditor("# via session flush"));
      result.current.scheduleSerialize(makeEditor("# via session flush"));
      registered[0]?.();
    });
    expect(changes).toEqual(["# via session flush"]);

    unmount();
    expect(unregistered).toBe(1);
  });

  it("a new onChange identity on re-render neither flushes nor re-registers", async () => {
    const calls: string[] = [];
    let registrations = 0;
    const registerPendingFlush = () => {
      registrations += 1;
      return () => {};
    };
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useMarkdownSync({
          onChange: (md) => calls.push(`${tag}:${md}`),
          registerPendingFlush,
        }),
      { initialProps: { tag: "first" } }
    );

    act(() => {
      result.current.setCurrentEditor(makeEditor("# draft"));
      result.current.scheduleSerialize(makeEditor("# draft"));
    });
    // Parent re-renders hand the hook a fresh onChange closure — that must
    // not force the pending serialization out early.
    rerender({ tag: "second" });
    rerender({ tag: "third" });
    expect(calls).toEqual([]);
    expect(registrations).toBe(1);

    // The debounce still fires once, through the latest onChange.
    await act(() => sleep(DEBOUNCE_SETTLE_MS));
    expect(calls).toEqual(["third:# draft"]);
  });

  it("the unmount flush emits through the latest onChange", () => {
    const calls: string[] = [];
    const { result, rerender, unmount } = renderHook(
      ({ tag }: { tag: string }) =>
        useMarkdownSync({ onChange: (md) => calls.push(`${tag}:${md}`) }),
      { initialProps: { tag: "first" } }
    );
    act(() => {
      result.current.setCurrentEditor(makeEditor("# tail"));
      result.current.scheduleSerialize(makeEditor("# tail"));
    });
    rerender({ tag: "latest" });
    unmount();
    expect(calls).toEqual(["latest:# tail"]);
  });

  it("does nothing without an onChange consumer", async () => {
    const { result } = renderHook(() => useMarkdownSync({}));
    act(() => {
      result.current.scheduleSerialize(makeEditor("# ignored"));
      result.current.flushPendingSerialization(makeEditor("# ignored"));
    });
    await act(() => sleep(DEBOUNCE_SETTLE_MS));
    // No throw, no consumer — the schedule is simply skipped.
  });
});
