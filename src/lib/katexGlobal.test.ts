import { afterEach, describe, expect, it } from "bun:test";

type KatexRuntime = NonNullable<typeof globalThis.katex>;

const stub = {
  version: "0.0.0-test",
  renderToString(input: string): string {
    return `rendered:${input}:${(this as { version: string }).version}`;
  },
};
const stubRuntime = stub as unknown as KatexRuntime;

afterEach(() => {
  delete (globalThis as { katex?: KatexRuntime }).katex;
});

describe("katexGlobal", () => {
  it("can be imported before the runtime script has loaded", async () => {
    delete (globalThis as { katex?: KatexRuntime }).katex;
    const { default: katex } = await import("./katexGlobal");
    expect(katex).toBeDefined();
  });

  it("throws on first use when the runtime is missing", async () => {
    delete (globalThis as { katex?: KatexRuntime }).katex;
    const { default: katex } = await import("./katexGlobal");
    expect(() => katex.version).toThrow(/KaTeX runtime was not loaded/);
  });

  it("forwards to the loaded runtime and binds its methods", async () => {
    globalThis.katex = stubRuntime;
    const { default: katex } = await import("./katexGlobal");
    expect(katex.version).toBe("0.0.0-test");
    const detached = katex.renderToString;
    expect(detached("x")).toBe("rendered:x:0.0.0-test");
  });
});
