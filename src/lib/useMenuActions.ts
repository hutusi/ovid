import { useEffect, useRef } from "react";
import { type AppActionCtx, dispatchAppAction, getAppAction } from "./appActions";
import { listenEvent } from "./commands/internal";

// The native-menu adapter for the global action table (ADR 0018): menu
// payload ids ARE action ids, so the handler is a table lookup. Menu items
// that route to the *editor* (format-*, insert-*, find*) are dispatched by
// useEditorCommands, not here — an unknown id is simply ignored.

/** Wire native menu events to the app action table. */
export function useMenuActions(ctx: AppActionCtx): void {
  // Subscribe once and read the latest ctx through a ref. Re-subscribing on
  // every ctx change (it changes on most App renders) churned listen/unlisten
  // IPC and left a gap while the async `listen` was pending in which a menu
  // event — Quit included — could be dropped.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  useEffect(() => {
    return listenEvent<string>("menu-action", (payload) => {
      const action = getAppAction(payload);
      if (!action) return;
      dispatchAppAction(action, ctxRef.current, { inInput: false });
    });
  }, []);
}
