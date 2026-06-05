import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { act, render } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";
import en from "../locales/en.json";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
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
          str = str.split(`{{${k}}}`).join(String(v));
        }
      }
      return str;
    },
    i18n: { language: "en", changeLanguage: mock(() => {}) },
  }),
}));

import { deriveDisplayNameFromUrl, WorkspaceSwitcher } from "./WorkspaceSwitcher";

describe("deriveDisplayNameFromUrl", () => {
  it("strips a trailing .git suffix from an https URL", () => {
    expect(deriveDisplayNameFromUrl("https://github.com/foo/bar.git")).toBe("bar");
  });

  it("handles URLs without a .git suffix", () => {
    expect(deriveDisplayNameFromUrl("https://github.com/foo/bar")).toBe("bar");
  });

  it("strips trailing slashes before taking the last segment", () => {
    expect(deriveDisplayNameFromUrl("https://github.com/foo/bar/")).toBe("bar");
  });

  it("handles scp-style ssh URLs", () => {
    expect(deriveDisplayNameFromUrl("git@github.com:foo/bar.git")).toBe("bar");
  });

  it("returns null for an empty input", () => {
    expect(deriveDisplayNameFromUrl("")).toBeNull();
    expect(deriveDisplayNameFromUrl("   ")).toBeNull();
  });
});

describe("WorkspaceSwitcher two-pane shell", () => {
  beforeAll(registerHappyDom);
  afterAll(unregisterHappyDom);

  function renderSwitcher() {
    return render(
      <WorkspaceSwitcher
        recentWorkspaces={[
          { rootPath: "/a", name: "alpha", lastOpenedAt: 1 },
          { rootPath: "/b", name: "beta", lastOpenedAt: 2 },
        ]}
        currentRootPath="/a"
        onSelect={mock(() => {})}
        onOpenOther={mock(() => {})}
        onRemoveRecent={mock(() => {})}
        onCreate={mock(() => Promise.resolve(true))}
        onClone={mock(() => Promise.resolve(true))}
        onToast={mock(() => {})}
        onClose={mock(() => {})}
      />
    );
  }

  it("renders four section tabs with the WAI-ARIA tab pattern", () => {
    const { container } = renderSwitcher();
    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs).toHaveLength(4);
    // Recent is the default — exactly one tab is aria-selected.
    const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Recent");
  });

  it("shows the recent list on the default tab and switches when another tab is clicked", () => {
    const { container } = renderSwitcher();
    // Default (Recent) shows the workspace names from the props.
    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("beta");
    // The Open-folder explainer text only lives under the Open tab.
    expect(container.textContent).not.toContain(en.workspace_switcher.open_explainer);

    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    const openTab = tabs.find((t) => t.textContent?.includes("Open folder"));
    if (!openTab) throw new Error("Open folder tab not found");
    act(() => {
      openTab.click();
    });

    // Now the Open panel content is visible; the Recent list is gone.
    expect(container.textContent).toContain(en.workspace_switcher.open_explainer);
    expect(container.textContent).not.toContain("alpha");
  });
});
