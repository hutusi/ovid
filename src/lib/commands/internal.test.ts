import { describe, expect, mock, test } from "bun:test";

// Stand-in for @tauri-apps/api/core's `invoke`. Each test resets it.
let nextInvokeImpl: (...args: unknown[]) => Promise<unknown> = () => Promise.resolve();

mock.module("@tauri-apps/api/core", () => ({
  invoke: (name: string, args?: unknown, options?: unknown) => nextInvokeImpl(name, args, options),
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

// Import after the mock is registered so the wrapper closes over the stub.
const { invokeCmd, invokeRaw } = await import("./internal");
const { assets } = await import("./assets");

describe("invokeCmd", () => {
  test("forwards the resolved value through unchanged", async () => {
    nextInvokeImpl = () => Promise.resolve({ ok: true, count: 3 });
    const result = await invokeCmd<{ ok: boolean; count: number }>("noop");
    expect(result).toEqual({ ok: true, count: 3 });
  });

  test("forwards args to invoke verbatim", async () => {
    const seen: unknown[] = [];
    nextInvokeImpl = (name, args) => {
      seen.push([name, args]);
      return Promise.resolve(undefined);
    };
    await invokeCmd<void>("write_file", { path: "a.md", content: "hi" });
    expect(seen).toEqual([["write_file", { path: "a.md", content: "hi" }]]);
  });

  test("normalises a rejected string into an Error with the string as message", async () => {
    nextInvokeImpl = () => Promise.reject("file not found");
    let caught: unknown;
    try {
      await invokeCmd<void>("read_file");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("file not found");
  });

  test("passes an existing Error rejection through unchanged", async () => {
    const original = new Error("upstream broke");
    nextInvokeImpl = () => Promise.reject(original);
    let caught: unknown;
    try {
      await invokeCmd<void>("noop");
    } catch (err) {
      caught = err;
    }
    // Re-thrown by reference so callers can match on the original error
    // (e.g. instanceof a custom subclass) without losing the stack.
    expect(caught).toBe(original);
  });

  test("stringifies non-string non-Error rejections into an Error", async () => {
    nextInvokeImpl = () => Promise.reject({ code: 42 });
    let caught: unknown;
    try {
      await invokeCmd<void>("noop");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    // Standard Object.prototype.toString fallback — not pretty, but never
    // loses information vs. silently swallowing the error.
    expect((caught as Error).message).toBe("[object Object]");
  });
});

describe("raw-body commands", () => {
  test("invokeRaw sends the bytes as the body and metadata as headers", async () => {
    const seen: unknown[] = [];
    nextInvokeImpl = (...call) => {
      seen.push(call);
      return Promise.resolve("ok");
    };
    const body = new Uint8Array([1, 2, 3]);
    await expect(invokeRaw<string>("upload", body, { "x-kind": "png" })).resolves.toBe("ok");
    expect(seen).toEqual([["upload", body, { headers: { "x-kind": "png" } }]]);
  });

  test("saveFromBytes percent-encodes the active file path for its header", async () => {
    const seen: unknown[] = [];
    nextInvokeImpl = (...call) => {
      seen.push(call);
      return Promise.resolve("images/pasted-image.png");
    };
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await assets.saveFromBytes({ bytes, extension: "png", activeFilePath: "/ws/笔记/a b.md" });
    expect(seen).toEqual([
      [
        "save_asset_from_bytes",
        bytes,
        {
          headers: {
            "x-ovid-extension": "png",
            "x-ovid-active-file": "%2Fws%2F%E7%AC%94%E8%AE%B0%2Fa%20b.md",
          },
        },
      ],
    ]);
  });

  test("invokeRaw normalises a rejected string into an Error", async () => {
    nextInvokeImpl = () => Promise.reject("unsupported image type: exe");
    await expect(invokeRaw<string>("upload", new Uint8Array(), {})).rejects.toThrow(
      "unsupported image type: exe"
    );
  });
});
