import Image from "@tiptap/extension-image";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { resolveImageSrc } from "../imageUtils";

export { resolveImageSrc };

export interface ImageRendererOptions {
  filePath?: string;
  assetRoot?: string;
  cdnBase?: string;
  inline?: boolean;
  allowBase64?: boolean;
  HTMLAttributes?: Record<string, unknown>;
}

function ImageNodeView({ node, extension, selected, updateAttributes }: NodeViewProps) {
  const { filePath, assetRoot, cdnBase } = extension.options as ImageRendererOptions;
  const { src, alt } = node.attrs as { src: string; alt?: string };

  const [srcInput, setSrcInput] = useState(src);
  const [altInput, setAltInput] = useState(alt ?? "");

  // Keep refs so onBlur always reads the latest value regardless of render timing
  const srcRef = useRef(srcInput);
  const altRef = useRef(altInput);

  const updateSrc = (v: string) => {
    setSrcInput(v);
    srcRef.current = v;
  };
  const updateAlt = (v: string) => {
    setAltInput(v);
    altRef.current = v;
  };

  // Sync from node attrs when not editing (undo/redo, external updates)
  useEffect(() => {
    if (!selected) {
      setSrcInput(src);
      srcRef.current = src;
    }
  }, [src, selected]);
  useEffect(() => {
    if (!selected) {
      setAltInput(alt ?? "");
      altRef.current = alt ?? "";
    }
  }, [alt, selected]);

  const resolvedSrc = resolveImageSrc(srcInput, filePath, assetRoot, cdnBase);

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className={`image-node-wrapper${selected ? " image-selected" : ""}`}
    >
      <img src={resolvedSrc} alt={altInput} />
      {selected && (
        <div className="image-edit-bar">
          <div className="image-edit-field">
            <span className="image-edit-label">src</span>
            <input
              className="image-edit-input image-edit-input--src"
              value={srcInput}
              onChange={(e) => updateSrc(e.target.value)}
              onBlur={() => updateAttributes({ src: srcRef.current })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  updateAttributes({ src: srcRef.current });
                  e.currentTarget.blur();
                }
              }}
              aria-label="Image source path or URL"
              spellCheck={false}
            />
          </div>
          <div className="image-edit-divider" aria-hidden="true" />
          <div className="image-edit-field image-edit-field--alt">
            <span className="image-edit-label">alt</span>
            <input
              className="image-edit-input image-edit-input--alt"
              value={altInput}
              onChange={(e) => updateAlt(e.target.value)}
              onBlur={() => updateAttributes({ alt: altRef.current })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  updateAttributes({ alt: altRef.current });
                  e.currentTarget.blur();
                }
              }}
              aria-label="Image alt text"
            />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const ImageRenderer = Image.extend<ImageRendererOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      filePath: undefined,
      assetRoot: undefined,
      cdnBase: undefined,
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
