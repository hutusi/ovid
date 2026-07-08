import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ── Tauri window seam mock ───────────────────────────────────────────────────
// Capture the close-requested handler so the test can fire it, and spy on
// destroy() to assert the window is (or isn't) torn down.

type CloseHandler = (event: { preventDefault: () => void }) => unknown;
let closeHandler: CloseHandler | null = null;
let destroyCalls = 0;
let destroyImpl: () => Promise<void> = () => Promise.resolve();

mock.module("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (handler: CloseHandler) => {
      closeHandler = handler;
      return Promise.resolve(() => {
        closeHandler = null;
      });
    },
    destroy: () => {
      destroyCalls += 1;
      return destroyImpl();
    },
  }),
}));

const { useCloseGuard } = await import("./useCloseGuard");

type FlushOpts = { mode?: "blocking" | "background" };

/** Fire the captured close-requested handler and wait for its async body. */
async function fireClose(): Promise<{ prevented: boolean }> {
  let prevented = false;
  const result = closeHandler?.({
    preventDefault: () => {
      prevented = true;
    },
  });
  await result;
  return { prevented };
}

describe("useCloseGuard", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  beforeEach(() => {
    closeHandler = null;
    destroyCalls = 0;
    destroyImpl = () => Promise.resolve();
  });

  it("blocks-flushes then destroys the window on close", async () => {
    const flush = mock((_opts?: FlushOpts) => Promise.resolve());
    const showToast = mock(() => {});
    renderHook(() => useCloseGuard(flush, showToast));

    await waitFor(() => expect(closeHandler).not.toBeNull());
    const { prevented } = await fireClose();

    expect(prevented).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toEqual({ mode: "blocking" });
    expect(destroyCalls).toBe(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("keeps the window open and toasts when the save fails", async () => {
    const flush = mock((_opts?: FlushOpts) => Promise.reject(new Error("disk full")));
    const showToast = mock(() => {});
    renderHook(() => useCloseGuard(flush, showToast));

    await waitFor(() => expect(closeHandler).not.toBeNull());
    await fireClose();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(destroyCalls).toBe(0);
    expect(showToast).toHaveBeenCalledWith("errors.close_save_failed");
  });

  it("background-flushes on window blur", async () => {
    const flush = mock((_opts?: FlushOpts) => Promise.resolve());
    renderHook(() =>
      useCloseGuard(
        flush,
        mock(() => {})
      )
    );

    await waitFor(() => expect(closeHandler).not.toBeNull());
    // Use window.Event (not the global Event) so the constructor and
    // dispatchEvent come from the same happy-dom realm even when another
    // happy-dom test file registered the DOM first.
    window.dispatchEvent(new window.Event("blur"));

    expect(flush).toHaveBeenCalledWith({ mode: "background" });
  });
});
