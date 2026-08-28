#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createLinter } from "actionlint";
import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
} from "yaml";

const WORKFLOW_DIRECTORY = ".github/workflows";

function diagnostic(file, line, column, message, kind) {
  return { file, line, column, message, kind };
}

function nodeValue(map, key) {
  const node = isMap(map) ? map.get(key, true) : undefined;
  return isScalar(node) ? node.value : undefined;
}

function shellDiagnostics(document, lineCounter, file) {
  const diagnostics = [];
  const jobs = document.get("jobs", true);

  if (!isMap(jobs)) {
    return diagnostics;
  }

  for (const jobPair of jobs.items) {
    const job = jobPair.value;
    const runner = nodeValue(job, "runs-on");
    const steps = isMap(job) ? job.get("steps", true) : undefined;

    if (!isSeq(steps)) {
      continue;
    }

    for (const step of steps.items) {
      if (!isMap(step)) {
        continue;
      }

      const runNode = step.get("run", true);
      if (!isScalar(runNode) || typeof runNode.value !== "string") {
        continue;
      }

      const configuredShell = nodeValue(step, "shell");
      const isWindowsDefault =
        typeof runner === "string" && runner.toLowerCase().includes("windows");
      const usesBash =
        configuredShell === undefined
          ? !isWindowsDefault
          : /(^|\s|\/)(ba)?sh(\s|$)/i.test(String(configuredShell));

      if (!usesBash) {
        continue;
      }

      const result = spawnSync("bash", ["-n"], {
        encoding: "utf8",
        input: runNode.value,
      });

      if (result.status === 0) {
        continue;
      }

      const stderrLines = result.stderr.trim().split("\n").filter(Boolean);
      const rawMessage = stderrLines.at(-1) ?? "bash reported invalid syntax";
      const shellLineMatch = rawMessage.match(/line (\d+)/);
      const shellLine = Number(shellLineMatch?.[1] ?? 1);
      const scalarPosition = lineCounter.linePos(runNode.range[0]);
      const blockOffset =
        runNode.type === "BLOCK_LITERAL" || runNode.type === "BLOCK_FOLDED"
          ? 0
          : -1;
      const workflowLine = scalarPosition.line + blockOffset + shellLine;
      const message = rawMessage.replace(/^bash: line \d+:\s*/, "");

      diagnostics.push(
        diagnostic(file, workflowLine, 1, message, "shell-syntax"),
      );
    }
  }

  return diagnostics;
}

async function defaultWorkflowFiles() {
  const entries = await readdir(WORKFLOW_DIRECTORY, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && /\.(?:ya?ml)$/i.test(entry.name),
    )
    .map((entry) => path.join(WORKFLOW_DIRECTORY, entry.name))
    .sort();
}

async function lintFile(file, actionlint) {
  const source = await readFile(file, "utf8");
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    return document.errors.map((error) => {
      const position = error.linePos?.[0] ?? { line: 1, col: 1 };
      return diagnostic(
        file,
        position.line,
        position.col,
        error.message,
        "yaml-syntax",
      );
    });
  }

  return [
    ...actionlint(source, file),
    ...shellDiagnostics(document, lineCounter, file),
  ];
}

const files =
  process.argv.length > 2 ? process.argv.slice(2) : await defaultWorkflowFiles();
const actionlint = await createLinter();
const diagnostics = (
  await Promise.all(files.map((file) => lintFile(file, actionlint)))
)
  .flat()
  .sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column,
  );

for (const item of diagnostics) {
  console.error(
    `${item.file}:${item.line}:${item.column}: ${item.message} [${item.kind}]`,
  );
}

if (diagnostics.length > 0) {
  console.error(
    `Workflow lint failed: ${diagnostics.length} issue(s) in ${files.length} file(s).`,
  );
  process.exitCode = 1;
} else {
  console.log(`Workflow lint passed: ${files.length} file(s) checked.`);
}