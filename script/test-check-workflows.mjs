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

function assertTypeCheckOrder(workflow) {
  assert.ok(
    Object.hasOwn(workflow.on ?? {}, "pull_request"),
    "test.yml must run on pull requests",
  );
  const steps = workflow.jobs?.test?.steps;
  assert.ok(Array.isArray(steps), "test.yml must contain jobs.test.steps");
  const installIndex = steps.findIndex(
    (step) => typeof step.run === "string" && /^npm ci(?:\s+--[\w=-]+)*$/.test(step.run.trim()),
  );
  const checkIndex = steps.findIndex(
    (step) => step.run?.trim() === "npm run check",
  );
  const testIndex = steps.findIndex(
    (step) => step.run?.trim() === "npm test",
  );

  assert.ok(installIndex >= 0, "test.yml must execute npm ci");
  assert.ok(checkIndex >= 0, "test.yml must execute npm run check");
  assert.ok(testIndex >= 0, "test.yml must execute npm test");
  assert.ok(
    installIndex < checkIndex,
    "npm run check must run after npm ci",
  );
  assert.ok(
    checkIndex < testIndex,
    "npm run check must run before npm test",
  );
}

function runAssertion(name, assertion) {
  try {
    assertion();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(error);
    failed += 1;
  }
}

function assertReservationFlowIsolation(workflow) {
  const job = workflow.jobs?.["reservation-flow"];
  assert.ok(job, "test.yml must contain a dedicated reservation-flow job");
  assert.equal(job.services?.postgres?.image, "postgres:16");
  assert.equal(job.services.postgres.env.POSTGRES_DB, "reservation_flow_test");
  const testUrl = job.env?.RESERVATION_FLOW_TEST_DATABASE_URL;
  assert.ok(testUrl, "reservation-flow must explicitly opt in");
  assert.equal(job.env.DATABASE_URL, testUrl, "reservation-flow database URLs must match");
  const parsed = new URL(testUrl);
  assert.equal(parsed.hostname, "127.0.0.1", "reservation-flow must use the guarded local host");
  assert.equal(parsed.pathname, "/reservation_flow_test");
  assert.notEqual(job.env.DATABASE_URL, workflow.jobs.test.env.DATABASE_URL);
  assert.equal(workflow.jobs.test.env.RESERVATION_FLOW_TEST_DATABASE_URL, undefined);
  assert.equal(job.if, undefined, "reservation-flow must not be conditional");
  assert.equal(job["continue-on-error"], undefined, "reservation-flow must block CI on failure");
  const commands = job.steps.filter(step => step.run).map(step => step.run.trim());
  const migrateIndex = commands.indexOf("npm run db:migrate:ci");
  const runIndex = commands.indexOf(
    "npx vitest run --config vitest.server.pg.config.ts server/tests/reservation-operational-flow.pg.test.ts",
  );
  assert.ok(migrateIndex >= 0, "reservation-flow must migrate its fresh database");
  assert.ok(runIndex > migrateIndex, "reservation-flow must run only its suite after migration");
  assert.ok(
    !commands.some(command => command === "npm test" || command === "npm run test:postgres"),
    "reservation-flow must not share fixtures with the full suite",
  );
  assert.ok(
    job.steps.every(step => step["continue-on-error"] === undefined && step.if === undefined),
    "reservation-flow steps must not silently skip or ignore failures",
  );
}

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

  const document = parseDocument(
    await readFile(".github/workflows/test.yml", "utf8"),
  );
  runAssertion("pull-request-type-check-order", () => {
    assert.deepEqual(document.errors, [], "test.yml must be valid YAML");
    assertTypeCheckOrder(document.toJS());
  });
  runAssertion("reservation-flow-isolation", () => {
    assertReservationFlowIsolation(document.toJS());
  });
  for (const [name, mutate] of [
    ["missing-reservation-flow-opt-in", workflow => {
      delete workflow.jobs["reservation-flow"].env.RESERVATION_FLOW_TEST_DATABASE_URL;
    }],
    ["reservation-flow-shared-database", workflow => {
      workflow.jobs["reservation-flow"].env.DATABASE_URL = workflow.jobs.test.env.DATABASE_URL;
    }],
    ["reservation-flow-missing-migration", workflow => {
      workflow.jobs["reservation-flow"].steps = workflow.jobs["reservation-flow"].steps
        .filter(step => step.run !== "npm run db:migrate:ci");
    }],
    ["reservation-flow-runs-full-suite", workflow => {
      workflow.jobs["reservation-flow"].steps.push({ run: "npm run test:postgres" });
    }],
    ["reservation-flow-ignored-failure", workflow => {
      workflow.jobs["reservation-flow"]["continue-on-error"] = true;
    }],
  ]) {
    runAssertion(name, () => {
      const workflow = document.toJS();
      mutate(workflow);
      assert.throws(() => assertReservationFlowIsolation(workflow));
    });
  }

  // Negative cases prove that removing or moving the check trips the guard.
  for (const [name, commands, message] of [
    ["missing-type-check", ["npm ci", "npm test"], /must execute npm run check/],
    ["type-check-before-install", ["npm run check", "npm ci", "npm test"], /must run after npm ci/],
    ["type-check-after-tests", ["npm ci", "npm test", "npm run check"], /must run before npm test/],
  ]) {
    runAssertion(name, () => {
      assert.throws(
        () => assertTypeCheckOrder({
          on: { pull_request: {} },
          jobs: { test: { steps: commands.map((run) => ({ run })) } },
        }),
        message,
      );
    });
  }

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