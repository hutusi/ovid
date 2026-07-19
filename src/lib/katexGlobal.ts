const katexRuntime = globalThis.katex;

if (!katexRuntime) {
  throw new Error("KaTeX runtime was not loaded before the math extension");
}

export default katexRuntime;
