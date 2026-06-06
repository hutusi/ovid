import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { registerHappyDom, unregisterHappyDom } from "../../../scripts/test-setup";
import { IMEComposition, imeCompositionKey } from "./IMEComposition";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

function createEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit, IMEComposition],
    content: "<p></p>",
  });
}

describe("IMEComposition", () => {
  it("plugin state starts with composing=false", () => {
    const editor = createEditor();
    expect(imeCompositionKey.getState(editor.state)).toEqual({ composing: false });
    editor.destroy();
  });

  it("compositionstart flips composing=true synchronously", () => {
    const editor = createEditor();
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(imeCompositionKey.getState(editor.state)?.composing).toBe(true);
    editor.destroy();
  });

  it("compositionend clears composing after a microtask", async () => {
    const editor = createEditor();
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(imeCompositionKey.getState(editor.state)?.composing).toBe(true);

    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    // Re-enable is deferred so the IME's own commit transaction lands first.
    expect(imeCompositionKey.getState(editor.state)?.composing).toBe(true);

    await Promise.resolve();
    expect(imeCompositionKey.getState(editor.state)?.composing).toBe(false);
    editor.destroy();
  });

  it("compositionend returns true so downstream handlers are short-circuited", () => {
    const editor = createEditor();
    const event = new CompositionEvent("compositionend", { cancelable: true });
    // dispatchEvent returns false if a listener called preventDefault.
    // A `return true` from handleDOMEvents in ProseMirror does NOT call
    // preventDefault; we just assert the event propagates without error
    // and that composing is still true synchronously (microtask not drained).
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dom.dispatchEvent(event);
    expect(imeCompositionKey.getState(editor.state)?.composing).toBe(true);
    editor.destroy();
  });
});
