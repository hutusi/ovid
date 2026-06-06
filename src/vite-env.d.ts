/// <reference types="vite/client" />

// Mirror the asset wildcards we actually consume so the typings survive
// `tsconfig.test.json` overriding `compilerOptions.types` to `["bun-types"]`
// (which drops the triple-slash reference above). The `?url` form is
// load-bearing: it lets TypeScript resolve PNG imports whose relative path
// climbs outside the tsconfig `include` scope (e.g. `branding/*` at the
// repo root), where the bare `*.png` wildcard would otherwise fail because
// TS first tries to physically resolve the file before consulting wildcards.
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*?url" {
  const src: string;
  export default src;
}
