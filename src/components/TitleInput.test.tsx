import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import en from "../locales/en.json";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);
afterEach(cleanup);

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const parts = key.split(".");
      let value: unknown = en;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === "string" ? value : key;
    },
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { TitleInput } from "./TitleInput";

function getTextarea(container: HTMLElement): HTMLTextAreaElement {
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("textarea not found");
  return textarea;
}

function pressKey(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

describe("TitleInput", () => {
  it("calls onSubmit when Enter is pressed (not during composition)", () => {
    const onSubmit = mock(() => {});
    const { container } = render(
      <TitleInput title="" onChange={mock(() => {})} onSubmit={onSubmit} />
    );
    pressKey(getTextarea(container), "Enter");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onSubmit when Enter fires during IME composition", () => {
    const onSubmit = mock(() => {});
    const { container } = render(
      <TitleInput title="" onChange={mock(() => {})} onSubmit={onSubmit} />
    );
    // Chinese/Japanese IMEs send Enter to commit the candidate while
    // `isComposing` is true on the native event. We must not steal it.
    pressKey(getTextarea(container), "Enter", { isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit for non-Enter keys", () => {
    const onSubmit = mock(() => {});
    const { container } = render(
      <TitleInput title="" onChange={mock(() => {})} onSubmit={onSubmit} />
    );
    const textarea = getTextarea(container);
    pressKey(textarea, "a");
    pressKey(textarea, "Tab");
    pressKey(textarea, "Escape");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("works without an onSubmit prop (back-compat)", () => {
    const { container } = render(<TitleInput title="" onChange={mock(() => {})} />);
    // Should not throw when Enter is pressed and no handler is wired
    expect(() => pressKey(getTextarea(container), "Enter")).not.toThrow();
  });
});
