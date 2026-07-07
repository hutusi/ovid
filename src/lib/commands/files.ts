import { invokeCmd } from "./internal";

/** Error message the Rust `write_file` returns when the file changed on disk
 *  since the client last read/wrote it. Matched verbatim to open the
 *  external-change conflict prompt instead of clobbering. Mirrors
 *  `EXTERNAL_CHANGE_CONFLICT` in `src-tauri/src/files.rs`. */
export const EXTERNAL_CHANGE_CONFLICT = "EXTERNAL_CHANGE_CONFLICT";

export interface ReadFileArgs {
  path: string;
}

export interface GetFileMtimeArgs {
  path: string;
}

export interface WriteFileArgs {
  path: string;
  content: string;
  /** The mtime token (ms since epoch) the client last saw for this file, or
   *  null to force the write (conflict resolution / new file). */
  expectedMtime: number | null;
}

export interface CreateFileArgs {
  path: string;
  content: string;
}

export interface RenameFileArgs {
  oldPath: string;
  newPath: string;
}

export interface DuplicateEntryArgs {
  srcPath: string;
  destPath: string;
}

export interface TrashFileArgs {
  path: string;
}

export interface CreateDirArgs {
  path: string;
}

export interface EnsureDirArgs {
  path: string;
}

export const files = {
  read: (args: ReadFileArgs) => invokeCmd<string>("read_file", args),
  getMtime: (args: GetFileMtimeArgs) => invokeCmd<number | null>("get_file_mtime", args),
  /** Returns the post-write mtime token. Rejects with EXTERNAL_CHANGE_CONFLICT
   *  when expectedMtime is set and the file changed on disk. */
  write: (args: WriteFileArgs) => invokeCmd<number>("write_file", args),
  create: (args: CreateFileArgs) => invokeCmd<void>("create_file", args),
  rename: (args: RenameFileArgs) => invokeCmd<void>("rename_file", args),
  duplicate: (args: DuplicateEntryArgs) => invokeCmd<void>("duplicate_entry", args),
  trash: (args: TrashFileArgs) => invokeCmd<void>("trash_file", args),
  createDir: (args: CreateDirArgs) => invokeCmd<void>("create_dir", args),
  ensureDir: (args: EnsureDirArgs) => invokeCmd<void>("ensure_dir", args),
};
