import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import { useToast } from "./useToast";

describe("useToast — notification history", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  it("records every fired toast in the history with a timestamp", () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unread).toBe(0);

    act(() => {
      result.current.showToast("First message");
      result.current.showToast("Second message");
    });

    expect(result.current.notifications.map((n) => n.message)).toEqual([
      "First message",
      "Second message",
    ]);
    expect(result.current.notifications.every((n) => typeof n.at === "number")).toBe(true);
  });

  it("bumps the unread counter on each new toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("a");
      result.current.showToast("b");
      result.current.showToast("c");
    });

    expect(result.current.unread).toBe(3);
  });

  it("markNotificationsRead resets unread without dropping the history", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("one");
      result.current.showToast("two");
    });
    act(() => {
      result.current.markNotificationsRead();
    });

    expect(result.current.unread).toBe(0);
    expect(result.current.notifications).toHaveLength(2);
  });

  it("clearNotifications drops the history and zeroes unread", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("one");
      result.current.showToast("two");
    });
    act(() => {
      result.current.clearNotifications();
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unread).toBe(0);
  });

  it("caps the history at 20 entries, dropping oldest first", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      for (let i = 0; i < 25; i++) result.current.showToast(`msg ${i}`);
    });

    expect(result.current.notifications).toHaveLength(20);
    // Oldest five (0..4) were dropped, newest twenty (5..24) survived in
    // chronological order.
    expect(result.current.notifications[0]?.message).toBe("msg 5");
    expect(result.current.notifications[19]?.message).toBe("msg 24");
  });
});

describe("useToast — presentation", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("defaults to info and records the kind", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("saved");
      result.current.showToast("broke", { kind: "error" });
    });
    expect(result.current.toasts.map((t) => t.kind)).toEqual(["info", "error"]);
    expect(result.current.notifications.map((n) => n.kind)).toEqual(["info", "error"]);
  });

  it("refreshes a repeated message instead of stacking copies", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("Failed to save", { kind: "error" });
      result.current.showToast("Failed to save", { kind: "error" });
      result.current.showToast("Failed to save", { kind: "error" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.notifications).toHaveLength(1);
  });

  it("keeps at most four toasts on screen", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      for (let i = 0; i < 6; i++) result.current.showToast(`m${i}`);
    });
    expect(result.current.toasts.map((t) => t.message)).toEqual(["m2", "m3", "m4", "m5"]);
  });

  it("holds a hovered toast and lets it go after the pointer leaves", async () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("held", { durationMs: 40 });
    });
    const id = result.current.toasts[0]?.id ?? -1;
    act(() => result.current.pauseToast(id));
    await act(() => sleep(120));
    expect(result.current.toasts.some((t) => t.id === id && !t.leaving)).toBe(true);

    act(() => result.current.resumeToast(id));
    await act(() => sleep(1300));
    expect(result.current.toasts.some((t) => t.id === id)).toBe(false);
  });

  it("dismisses on request", async () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("bye", { kind: "error" });
    });
    const id = result.current.toasts[0]?.id ?? -1;
    act(() => result.current.dismissToast(id));
    expect(result.current.toasts[0]?.leaving).toBe(true);
    await act(() => sleep(250));
    expect(result.current.toasts).toHaveLength(0);
  });
});
