import { invokeCmd } from "./internal";

export interface SetMenuLanguageArgs {
  labels: Record<string, string>;
}

/** The two checkable View menu items whose state is mirrored from the frontend. */
export type CheckableMenuItemId = "toggle-sidebar" | "toggle-properties";

export interface SetMenuCheckedArgs {
  id: CheckableMenuItemId;
  checked: boolean;
}

export const menu = {
  setLanguage: (args: SetMenuLanguageArgs) => invokeCmd<void>("set_menu_language", args),
  setChecked: (args: SetMenuCheckedArgs) => invokeCmd<void>("set_menu_checked", args),
};
