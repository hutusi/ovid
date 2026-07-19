import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const generatedDirectory = join(repositoryRoot, "src", "lib", "commands", "generated");

function snapshotGeneratedTypes(): Map<string, Buffer> {
  return new Map(
    readdirSync(generatedDirectory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => [name, readFileSync(join(generatedDirectory, name))]),
  );
}

const before = snapshotGeneratedTypes();
execFileSync(
  "cargo",
  ["test", "--manifest-path", join(repositoryRoot, "src-tauri", "Cargo.toml")],
  { cwd: repositoryRoot, stdio: "inherit" },
);
const after = snapshotGeneratedTypes();

const changed = new Set<string>();
for (const [name, contents] of before) {
  if (!after.get(name)?.equals(contents)) changed.add(name);
}
for (const name of after.keys()) {
  if (!before.has(name)) changed.add(name);
}

if (changed.size > 0) {
  console.error(
    `Generated command types drifted during cargo test:\n${[...changed]
      .sort()
      .map((name) => `- ${name}`)
      .join("\n")}`,
  );
  process.exit(1);
}
