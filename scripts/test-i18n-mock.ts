// Shared i18n mock for hook + component tests. Resolves keys against the
// English locale file so test assertions stay readable as plain strings
// rather than dotted key paths. Used by every test file that mocks
// react-i18next; pair with `mock.module("react-i18next", ...)` at the top
// of the test file.

import en from "../src/locales/en.json";

export function localT(key: string, vars?: Record<string, unknown>): string {
  const parts = key.split(".");
  let value: unknown = en;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  let str = typeof value === "string" ? value : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{{${k}}}`, String(v));
    }
  }
  return str;
}
