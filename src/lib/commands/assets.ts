import { invokeCmd, invokeRaw } from "./internal";

export interface SaveAssetArgs {
  srcPath: string;
  activeFilePath?: string;
}

export interface SaveAssetFromBytesArgs {
  bytes: Uint8Array;
  extension: string;
  activeFilePath?: string;
}

export const assets = {
  save: (args: SaveAssetArgs) => invokeCmd<string>("save_asset", args),
  /** Sends the bytes as the raw request body (see save_asset_from_bytes). */
  saveFromBytes: ({ bytes, extension, activeFilePath }: SaveAssetFromBytesArgs) =>
    invokeRaw<string>("save_asset_from_bytes", bytes, {
      "x-ovid-extension": extension,
      ...(activeFilePath ? { "x-ovid-active-file": encodeURIComponent(activeFilePath) } : {}),
    }),
  pickImage: () => invokeCmd<string | null>("pick_image_file"),
};
