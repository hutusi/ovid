import { describe, expect, it } from "bun:test";
import { DEFAULT_DISK_FORMAT, detectDiskFormat, encodeDiskText, stripBom } from "./diskText";

describe("detectDiskFormat", () => {
  it("detects LF without a BOM by default", () => {
    expect(detectDiskFormat("a\nb\n")).toEqual(DEFAULT_DISK_FORMAT);
    expect(detectDiskFormat("")).toEqual(DEFAULT_DISK_FORMAT);
  });

  it("detects a BOM and CRLF line endings", () => {
    expect(detectDiskFormat("﻿---\r\ntitle: T\r\n---\r\nbody\r\n")).toEqual({
      bom: true,
      eol: "\r\n",
    });
  });

  it("follows the majority when line endings are mixed", () => {
    expect(detectDiskFormat("a\r\nb\r\nc\n").eol).toBe("\r\n");
    expect(detectDiskFormat("a\nb\nc\r\n").eol).toBe("\n");
  });
});

describe("encodeDiskText", () => {
  it("re-applies CRLF to LF text and restores the BOM", () => {
    expect(encodeDiskText("---\ntitle: T\n---\nbody\n", { bom: true, eol: "\r\n" })).toBe(
      "﻿---\r\ntitle: T\r\n---\r\nbody\r\n"
    );
  });

  it("makes mixed line endings uniform without doubling carriage returns", () => {
    expect(encodeDiskText("a\r\nb\nc", { bom: false, eol: "\r\n" })).toBe("a\r\nb\r\nc");
    expect(encodeDiskText("a\r\nb\nc", DEFAULT_DISK_FORMAT)).toBe("a\nb\nc");
  });

  it("round-trips a file's own text byte for byte", () => {
    const raw = "﻿---\r\ntitle: T\r\n---\r\n# Heading\r\n\r\nText\r\n";
    expect(encodeDiskText(raw, detectDiskFormat(raw))).toBe(raw);
  });

  it("never writes a doubled BOM", () => {
    expect(encodeDiskText("﻿text", { bom: true, eol: "\n" })).toBe("﻿text");
  });
});

describe("stripBom", () => {
  it("removes only a leading BOM", () => {
    expect(stripBom("﻿a﻿")).toBe("a﻿");
    expect(stripBom("a")).toBe("a");
  });
});
