import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, fireEvent, render } from "@testing-library/react";
import { localT } from "../../scripts/test-i18n-mock";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: localT, i18n: { language: "en" } }),
}));

const { ErrorBoundary } = await import("./ErrorBoundary");

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("panel exploded\nat Flaky (stack line)");
  return <p>panel content</p>;
}

describe("ErrorBoundary compact variants", () => {
  it("contains the error to the panel and recovers on Reload panel", () => {
    shouldThrow = true;
    const onReset = mock(() => {});
    // React logs caught render errors; keep test output readable.
    const consoleError = console.error;
    console.error = () => {};
    const view = render(
      <div>
        <ErrorBoundary variant="panel" title="The sidebar ran into a problem" onReset={onReset}>
          <Flaky />
        </ErrorBoundary>
        <p>editor still here</p>
      </div>
    );
    console.error = consoleError;

    const alert = view.getByRole("alert");
    expect(alert.textContent).toContain("The sidebar ran into a problem");
    expect(alert.textContent).toContain("panel exploded");
    // Only the message's first line; the stack stays out of a compact notice.
    expect(alert.textContent).not.toContain("stack line");
    expect(view.getByText("editor still here")).toBeTruthy();

    shouldThrow = false;
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "Reload panel" }));
    });
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(view.getByText("panel content")).toBeTruthy();
    act(() => view.unmount());
  });
});
