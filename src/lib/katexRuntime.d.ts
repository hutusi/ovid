import type katexApi from "katex";

declare global {
  var katex: typeof katexApi | undefined;
}
