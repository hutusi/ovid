import { useEffect } from "react";
import { type AppActionCtx, dispatchAppAction, getAppAction } from "./appActions";
import { listenEvent } from "./commands/internal";

// The native-menu adapter for the global action table (ADR 0018): menu
// payload ids ARE action ids, so the handler is a table lookup. Menu items
// that route to the *editor* (format-*, insert-*, find*) are dispatched by
// useEditorCommands, not here — an unknown id is simply ignored.

/** Wire native menu events to the app action table. */
export function useMenuActions(ctx: AppActionCtx): void {
  useEffect(() => {
    return listenEvent<string>("menu-action", (payload) => {
      const action = getAppAction(payload);
      if (!action) return;
      dispatchAppAction(action, ctx, { inInput: false });
    });
  }, [ctx]);
}
