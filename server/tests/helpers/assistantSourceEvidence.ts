import { readFileSync } from "node:fs";
import path from "node:path";

/** Live-code tests locate a statement, never pin a stale line from another revision. */
export function sourceRange(file: string, anchor: string, before = 0, after = 8) {
  const lines = readFileSync(path.join(process.cwd(), file), "utf8").split("\n");
  const index = lines.findIndex(line => line.includes(anchor));
  if (index < 0) throw new Error(`Missing test evidence anchor in ${file}: ${anchor}`);
  return { path: file, start: Math.max(1, index + 1 - before), end: Math.min(lines.length, index + 1 + after) };
}
