import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const output = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "buffer" },
);
const paths = output
  .toString("utf8")
  .split("\0")
  .filter((path) => path.length > 0);
const failures: string[] = [];

for (const path of paths) {
  if (!existsSync(path)) continue;
  const contents = readFileSync(path);
  if (contents.includes(0)) continue;

  const lines = contents.toString("utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (/[ \t]+\r?$/.test(line)) failures.push(`${path}:${index + 1}: trailing whitespace`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

execFileSync("git", ["diff", "--check"], { stdio: "inherit" });
execFileSync("git", ["diff", "--cached", "--check"], { stdio: "inherit" });
