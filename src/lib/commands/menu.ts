import { invokeCmd } from "./internal";

export interface SetMenuLanguageArgs {
  labels: Record<string, string>;
}

export interface SetMenuCheckedArgs {
  id: string;
  checked: boolean;
}

export const menu = {
  setLanguage: (args: SetMenuLanguageArgs) => invokeCmd<void>("set_menu_language", args),
  setChecked: (args: SetMenuCheckedArgs) => invokeCmd<void>("set_menu_checked", args),
};
