#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "workflow-lint-fixtures-"),
);

let passed = 0;
let failed = 0;

async function runFixture(name, source, expectedExitCode, expectedOutput) {
  const file = path.join(temporaryDirectory, `${name}.yml`);
  await writeFile(file, source);

  const result = spawnSync(
    process.execPath,
    ["script/check-workflows.mjs", file],
    { encoding: "utf8" },
  );
  const output = `${result.stdout}${result.stderr}`;
  const matches =
    result.status === expectedExitCode && expectedOutput.test(output);

  if (matches) {
    console.log(`  PASS  ${name}`);
    passed += 1;
  } else {
    console.error(
      `  FAIL  ${name} (exit ${result.status}, expected ${expectedExitCode})`,
    );
    console.error(output);
    failed += 1;
  }
}

try {
  console.log("Running workflow-lint fixture tests...");

  await runFixture(
    "valid-workflow",
    `name: Fixture
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "ok"
`,
    0,
    /Workflow lint passed: 1 file\(s\) checked\./,
  );

  await runFixture(
    "malformed-yaml",
    `name: Fixture
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [
`,
    1,
    /malformed-yaml\.yml:\d+:\d+: .+ \[yaml-syntax\]/,
  );

  await runFixture(
    "malformed-action-expression",
    `name: Fixture
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo \${{ broken( }}
`,
    1,
    /malformed-action-expression\.yml:7:\d+: .+ \[expression\]/,
  );

  await runFixture(
    "malformed-shell",
    `name: Fixture
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |
          if true; then
            echo "missing fi"
`,
    1,
    /malformed-shell\.yml:\d+:1: .+ \[shell-syntax\]/,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Results: ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;