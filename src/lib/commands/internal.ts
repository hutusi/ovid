import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export async function invokeCmd<T>(name: string, args?: object): Promise<T> {
  try {
    return await invoke<T>(name, args as Record<string, unknown> | undefined);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(typeof err === "string" ? err : String(err));
  }
}

/** Invoke a command whose payload is raw bytes (sent as the request body,
 *  not JSON-encoded), with string metadata in request headers. */
export async function invokeRaw<T>(
  name: string,
  body: Uint8Array,
  headers: Record<string, string>
): Promise<T> {
  try {
    return await invoke<T>(name, body, { headers });
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(typeof err === "string" ? err : String(err));
  }
}

export function listenEvent<T>(name: string, handler: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;
  void listen<T>(name, (event) => {
    if (!cancelled) handler(event.payload);
  })
    .then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    })
    .catch((err) => {
      console.error(`listenEvent("${name}") failed:`, err);
    });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
