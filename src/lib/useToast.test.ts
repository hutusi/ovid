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
