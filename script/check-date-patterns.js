#!/usr/bin/env node
/**
 * check-date-patterns.js
 *
 * Scans every .ts/.tsx file under client/src for forbidden date patterns:
 *
 *   1. .toISOString().split("T")[0]  — returns UTC, not Argentina time.
 *      Caught in both single-line and multiline (method-chained) forms.
 *
 *   2. A local definition of getArgentinaToday — function declarations,
 *      const/let/var assignments, exported variants (including export default)
 *      — must not appear outside client/src/lib/date-utils.ts.
 *
 * Comments are lexically masked before matching so that:
 *   - Inline line comments  ( const x = 1; // bad pattern )
 *   - Full-line comments    ( // bad pattern )
 *   - Block/JSDoc comments  ( /* bad pattern *\/ )
 * are all invisible to the pattern search.
 * String literals are passed through unchanged (not mistaken for comments).
 *
 * Exit 0 = clean.  Exit 1 = violations found.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const CANONICAL = join("client", "src", "lib", "date-utils.ts");
const SCAN_DIR = join("client", "src");

// ── Comment masker ────────────────────────────────────────────────────────
/**
 * Returns a version of `source` with all comment content replaced by spaces,
 * preserving exact character offsets and newlines so that match indices
 * produced by RegExp.exec() on the masked string still map 1-to-1 to the
 * original source (useful for line-number calculation).
 *
 * String literals (single-quote, double-quote, template) are passed through
 * unchanged so that `//` or `/*` inside strings are not mistaken for comments.
 */
function maskComments(source) {
  const out = [];
  const len = source.length;
  let i = 0;

  while (i < len) {
    const ch = source[i];

    // ── String literals ────────────────────────────────────────────────
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out.push(ch);
      i++;
      while (i < len) {
        if (source[i] === "\\" && i + 1 < len) {
          // Escaped character: keep both bytes (escape + escaped char).
          out.push(source[i], source[i + 1]);
          i += 2;
        } else if (source[i] === quote) {
          out.push(source[i]);
          i++;
          break;
        } else {
          out.push(source[i]);
          i++;
        }
      }
      continue;
    }

    // ── Line comment  // ───────────────────────────────────────────────
    if (ch === "/" && source[i + 1] === "/") {
      out.push(" ", " "); // replace the // opener
      i += 2;
      // Mask everything up to (but not including) the newline.
      while (i < len && source[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }

    // ── Block / JSDoc comment  /* … */ ────────────────────────────────
    if (ch === "/" && source[i + 1] === "*") {
      out.push(" ", " "); // replace /*
      i += 2;
      while (i < len) {
        if (source[i] === "*" && source[i + 1] === "/") {
          out.push(" ", " "); // replace */
          i += 2;
          break;
        } else if (source[i] === "\n") {
          out.push("\n"); // preserve newlines for line numbering
          i++;
        } else {
          out.push(" ");
          i++;
        }
      }
      continue;
    }

    // ── Regular character ─────────────────────────────────────────────
    out.push(ch);
    i++;
  }

  return out.join("");
}

// ── Patterns ──────────────────────────────────────────────────────────────
const PATTERNS = [
  {
    name: 'toISOString().split("T")[0]',
    hint: "Use getArgentinaToday() imported from @/lib/date-utils instead.",
    // \s* spans optional whitespace / newlines between chained method calls,
    // catching both inline and multiline forms.
    regex:
      /toISOString\s*\(\s*\)\s*\.\s*split\s*\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/gms,
  },
  {
    name: "local getArgentinaToday definition",
    hint: "Import it from @/lib/date-utils instead of redefining it.",
    // Catches (with or without export / export default / async):
    //   function getArgentinaToday …
    //   async function getArgentinaToday …
    //   export function getArgentinaToday …
    //   export async function getArgentinaToday …
    //   export default function getArgentinaToday …
    //   export default async function getArgentinaToday …
    //   const/let/var getArgentinaToday = …
    //   const/let/var getArgentinaToday: <type> = …
    //   export const/let/var getArgentinaToday …
    regex:
      /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\s+getArgentinaToday|(?:const|let|var)\s+getArgentinaToday(?:\s*:[^=\n]+)?\s*=)/gm,
  },
];

// ── File walker ───────────────────────────────────────────────────────────
function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTs(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────
let totalErrors = 0;

const allFiles = walkTs(SCAN_DIR).filter(
  (f) => relative(process.cwd(), f) !== CANONICAL
);

for (const file of allFiles) {
  const source = readFileSync(file, "utf8");
  const masked = maskComments(source);
  const relPath = relative(process.cwd(), file);

  for (const { name, hint, regex } of PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(masked)) !== null) {
      const lineNum = masked.slice(0, match.index).split("\n").length;
      // Show the original (unmasked) text for the error snippet.
      const snippet = source
        .slice(match.index, match.index + match[0].length)
        .replace(/\n[ \t]*/g, " ↵ ")
        .slice(0, 120);

      console.error(`\nERROR: forbidden pattern — ${name}`);
      console.error(`  ${hint}`);
      console.error(`  ${relPath}:${lineNum}  ${snippet}`);
      totalErrors++;
    }
  }
}

if (totalErrors === 0) {
  console.log("✓ No forbidden date patterns found.");
  process.exit(0);
} else {
  console.error(
    `\n✗ ${totalErrors} forbidden date pattern(s) detected. Fix them before committing.`
  );
  process.exit(1);
}
