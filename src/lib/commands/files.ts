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

/** Rejection marker: a versioned save targeted a file that no longer exists
 *  (deleted or moved by another program). Mirrors `FILE_MISSING` in
 *  `src-tauri/src/files.rs`. */
export const FILE_MISSING = "FILE_MISSING";

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
   *  to force the write (conflict resolution / new file). Opaque string — the
   *  u64 hash overflows JS's safe-integer range, so it must not be a number. */
  expectedVersion: string | null;
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

/** Told the path and text of each write this app makes. */
export type WriteListener = (path: string, content: string) => void;

const writeListeners = new Set<WriteListener>();

/** Pass a successful write on to the listeners. A throwing listener is
 *  logged, never turned into a failed save. */
function reportWrite(path: string, content: string): void {
  for (const listener of writeListeners) {
    try {
      listener(path, content);
    } catch (err) {
      console.error("[files.onWrite] listener failed", err);
    }
  }
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
   *  when expectedVersion is set and the file's content changed on disk, and
   *  with FILE_MISSING when the file no longer exists. */
  write: (args: WriteFileArgs) =>
    invokeCmd<string>("write_file", args).then((version) => {
      reportWrite(args.path, args.content);
      return version;
    }),
  /** Creates a new file (fails if it exists); returns its version token. */
  create: (args: CreateFileArgs) =>
    invokeCmd<string>("create_file", args).then((version) => {
      reportWrite(args.path, args.content);
      return version;
    }),
  /** Subscribe to this app's own successful writes and creates, with the
   *  exact text written. The workspace watcher drops the events for them
   *  (Rust records its own writes, ADR 0021), so a cache of file contents
   *  learns of them only here. Returns an unsubscribe function. */
  onWrite: (listener: WriteListener): (() => void) => {
    writeListeners.add(listener);
    return () => {
      writeListeners.delete(listener);
    };
  },
  rename: (args: RenameFileArgs) => invokeCmd<void>("rename_file", args),
  duplicate: (args: DuplicateEntryArgs) => invokeCmd<void>("duplicate_entry", args),
  trash: (args: TrashFileArgs) => invokeCmd<void>("trash_file", args),
  createDir: (args: CreateDirArgs) => invokeCmd<void>("create_dir", args),
  ensureDir: (args: EnsureDirArgs) => invokeCmd<void>("ensure_dir", args),
};
