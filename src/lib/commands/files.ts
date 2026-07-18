import type { BulkFileContent } from "./generated/BulkFileContent";
import type { VersionedFile } from "./generated/VersionedFile";
import { invokeCmd } from "./internal";

/** Error message the Rust `write_file` returns when the file changed on disk
 *  since the client last read/wrote it. Matched verbatim to open the
 *  external-change conflict prompt instead of clobbering. Mirrors
 *  `EXTERNAL_CHANGE_CONFLICT` in `src-tauri/src/files.rs`. */
export const EXTERNAL_CHANGE_CONFLICT = "EXTERNAL_CHANGE_CONFLICT";

/** Error message `read_file` returns when a file exceeds the editor size limit.
 *  Mirrors `FILE_TOO_LARGE` in `src-tauri/src/files.rs`. */
export const FILE_TOO_LARGE = "FILE_TOO_LARGE";

export interface ReadFileArgs {
  path: string;
}

export interface ReadFilesBulkArgs {
  paths: string[];
}

export interface WriteFileArgs {
  path: string;
  content: string;
  /** The content-hash version token the client last saw for this file, or null
   *  to force the write (conflict resolution / new file). */
  expectedVersion: number | null;
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
  /** Read a file's content and its content-hash version token in one snapshot.
   *  The token is intrinsic to the content, so there's no read-time race and a
   *  later save can't pair stale content with someone else's token. Rejects
   *  with FILE_TOO_LARGE for oversized files. */
  readVersioned: (args: ReadFileArgs) => invokeCmd<VersionedFile>("read_file_versioned", args),
  /** Read many files in one IPC round-trip. Unreadable, oversized, or
   *  out-of-workspace paths are omitted from the result. */
  readBulk: (args: ReadFilesBulkArgs) => invokeCmd<BulkFileContent[]>("read_files_bulk", args),
  /** Returns the post-write version token. Rejects with EXTERNAL_CHANGE_CONFLICT
   *  when expectedVersion is set and the file's content changed on disk. */
  write: (args: WriteFileArgs) => invokeCmd<number>("write_file", args),
  create: (args: CreateFileArgs) => invokeCmd<void>("create_file", args),
  rename: (args: RenameFileArgs) => invokeCmd<void>("rename_file", args),
  duplicate: (args: DuplicateEntryArgs) => invokeCmd<void>("duplicate_entry", args),
  trash: (args: TrashFileArgs) => invokeCmd<void>("trash_file", args),
  createDir: (args: CreateDirArgs) => invokeCmd<void>("create_dir", args),
  ensureDir: (args: EnsureDirArgs) => invokeCmd<void>("ensure_dir", args),
};
