import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const assetsDirectory = join(import.meta.dir, "..", "dist", "assets");
const javascriptFiles = readdirSync(assetsDirectory).filter((name) => name.endsWith(".js"));

type Budget = {
  label: string;
  pattern: RegExp;
  rawKiB: number;
  gzipKiB: number;
};

const budgets: Budget[] = [
  { label: "application entry", pattern: /^index-[^.]+\.js$/, rawKiB: 360, gzipKiB: 110 },
  { label: "React vendor", pattern: /^react-vendor-[^.]+\.js$/, rawKiB: 200, gzipKiB: 65 },
  {
    label: "ProseMirror vendor",
    pattern: /^editor-prosemirror-[^.]+\.js$/,
    rawKiB: 400,
    gzipKiB: 140,
  },
  {
    label: "Tiptap vendor",
    pattern: /^editor-tiptap-[^.]+\.js$/,
    rawKiB: 280,
    gzipKiB: 90,
  },
  { label: "KaTeX runtime", pattern: /^katex\.min-[^.]+\.js$/, rawKiB: 300, gzipKiB: 90 },
  { label: "WeChat renderer", pattern: /^wechatHtml-[^.]+\.js$/, rawKiB: 120, gzipKiB: 50 },
];

const failures: string[] = [];
let totalRaw = 0;
let totalGzip = 0;

const measurements = new Map(
  javascriptFiles.map((name) => {
    const source = readFileSync(join(assetsDirectory, name));
    const measurement = {
      name,
      raw: source.byteLength,
      gzip: gzipSync(source).byteLength,
    };
    totalRaw += measurement.raw;
    totalGzip += measurement.gzip;
    return [name, measurement] as const;
  }),
);

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

for (const budget of budgets) {
  const matches = [...measurements.values()].filter(({ name }) => budget.pattern.test(name));
  if (matches.length !== 1) {
    failures.push(`${budget.label}: expected one matching chunk, found ${matches.length}`);
    continue;
  }

  const [measurement] = matches;
  const rawLimit = budget.rawKiB * 1024;
  const gzipLimit = budget.gzipKiB * 1024;
  console.log(
    `${budget.label}: ${formatKiB(measurement.raw)} raw, ${formatKiB(measurement.gzip)} gzip`,
  );
  if (measurement.raw > rawLimit) {
    failures.push(
      `${budget.label}: ${formatKiB(measurement.raw)} raw exceeds ${budget.rawKiB} KiB`,
    );
  }
  if (measurement.gzip > gzipLimit) {
    failures.push(
      `${budget.label}: ${formatKiB(measurement.gzip)} gzip exceeds ${budget.gzipKiB} KiB`,
    );
  }
}

// Everything index.html loads before first paint: the entry plus the chunks it
// preloads. The editor's vendor chunks (ProseMirror, Tiptap, highlighting) must
// load with the lazy Editor, never here — a stray side-effect import or chunk
// grouping that drags them in once cost ~750 KiB of startup JavaScript.
const indexHtml = readFileSync(join(assetsDirectory, "..", "index.html"), "utf8");
const startupFiles = [...indexHtml.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map(
  (match) => match[1]
);
const startupEditorChunks = startupFiles.filter((name) => name.startsWith("editor-"));
if (startupEditorChunks.length > 0) {
  failures.push(`index.html loads editor chunks at startup: ${startupEditorChunks.join(", ")}`);
}
const startupRaw = startupFiles.reduce(
  (sum, name) => sum + (measurements.get(name)?.raw ?? 0),
  0
);
const startupRawLimit = 600 * 1024;
console.log(`startup JavaScript: ${formatKiB(startupRaw)} raw (${startupFiles.length} files)`);
if (startupRaw > startupRawLimit) {
  failures.push(`startup JavaScript: ${formatKiB(startupRaw)} raw exceeds 600 KiB`);
}

const totalRawLimit = 2_100 * 1024;
const totalGzipLimit = 700 * 1024;
console.log(`all JavaScript: ${formatKiB(totalRaw)} raw, ${formatKiB(totalGzip)} gzip`);
if (totalRaw > totalRawLimit) {
  failures.push(`all JavaScript: ${formatKiB(totalRaw)} raw exceeds 2100 KiB`);
}
if (totalGzip > totalGzipLimit) {
  failures.push(`all JavaScript: ${formatKiB(totalGzip)} gzip exceeds 700 KiB`);
}

if (failures.length > 0) {
  console.error(`\nBundle budget failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
