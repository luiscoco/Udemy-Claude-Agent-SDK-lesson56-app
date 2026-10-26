import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateConfig } from "./protocol.js";
import { plan } from "./cases.js";
import { grade } from "./grader.js";
import { summarize } from "./report.js";
import { prepareWorkspace, SOURCE, FIXED, snapshot } from "./workspace.js";
import { toolDecision } from "./policy.js";
import { runProcess, privateEnv, redact } from "./processes.js";
test("browser inputs select fixed plans, never arbitrary prompts or paths", () => {
  assert.throws(() => validateConfig({ mode: "suite", prompt: "anything" }));
  assert.throws(() => validateConfig({ mode: "other" }));
  assert.equal(plan("repeated").length, 3);
  assert.deepEqual(plan("gate"), ["integration", "unchanged"]);
});
test("schema shape is separate from factual correctness", () => {
  const input = {
    result: { subtype: "success" },
    fixturesValid: true,
    tools: [],
    hooks: 0,
    structured: { project: "EVAL56", count: 3 },
    tests: null,
  };
  assert.equal(grade("structured", input).pass, true);
  assert.equal(grade("wrongexpected", input).pass, false);
  assert.equal(
    grade("structured", {
      ...input,
      structured: { project: "EVAL56", count: "3" },
    }).pass,
    false,
  );
});
test("native success cannot override failed independent tests or changed fixtures", () => {
  const input = {
    result: { subtype: "success" },
    fixturesValid: true,
    tools: [],
    hooks: 0,
    structured: null,
    tests: { exitCode: 1 },
  };
  assert.equal(grade("fix", input).pass, false);
  assert.equal(grade("fix", { ...input, tests: { exitCode: 0 } }).pass, true);
  assert.equal(
    grade("fix", { ...input, tests: { exitCode: 0 }, fixturesValid: false })
      .pass,
    false,
  );
  assert.equal(
    grade("fix", { ...input, result: { subtype: "error_max_turns" } }).pass,
    false,
  );
});
test("case-level gate cannot hide a failure in an easy-case average", () => {
  const rows = [
    ...Array.from({ length: 9 }, () => ({
      caseId: "easy",
      grade: { pass: true },
      result: { total_cost_usd: 0.01, num_turns: 2 },
    })),
    { caseId: "hard", grade: { pass: false }, result: {} },
  ];
  const r = summarize(rows);
  assert.equal(r.overallPassRate, 0.9);
  assert.equal(r.passed, false);
  assert.equal(r.groups[1].avgCostUsd, null);
  assert.equal(r.groups[1].costCoverage, 0);
  assert.throws(() => summarize([]));
  assert.ok(r.groups[0].wilson95[0] < 1);
});
test("fresh fixture copies, scoped hook and real independent tests", async () => {
  const a = await prepareWorkspace(),
    b = await prepareWorkspace();
  try {
    assert.notEqual(a.root, b.root);
    assert.equal(a.before.hash, b.before.hash);
    assert.equal(
      toolDecision(false, a.cwd, "Read", {
        file_path: join(a.cwd, "README.md"),
      }),
      true,
    );
    assert.equal(
      toolDecision(true, a.cwd, "Bash", { command: "node --test" }),
      false,
    );
    assert.equal(
      toolDecision(true, a.cwd, "Edit", {
        file_path: join(a.cwd, "src/utils.js"),
        old_string: SOURCE,
        new_string: FIXED,
      }),
      true,
    );
    assert.equal(
      toolDecision(true, a.cwd, "Edit", {
        file_path: join(a.cwd, "src/utils.js"),
        old_string: SOURCE,
        new_string: "arbitrary code",
      }),
      false,
    );
    const env = privateEnv(a);
    delete env.ANTHROPIC_API_KEY;
    const before = await runProcess(
      process.execPath,
      ["--test", "tests/utils.test.mjs"],
      { cwd: a.cwd, env },
    );
    assert.equal(before.exitCode, 1);
    await writeFile(join(a.cwd, "src/utils.js"), FIXED, "utf8");
    const after = await runProcess(
      process.execPath,
      ["--test", "tests/utils.test.mjs"],
      { cwd: a.cwd, env },
    );
    assert.equal(after.exitCode, 0);
    assert.equal((await snapshot(b.cwd)).hash, b.before.hash);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
test("redaction removes the current private key", () => {
  const prior = process.env.ANTHROPIC_API_KEY;
  try {
    process.env.ANTHROPIC_API_KEY = "private-test-value-12345";
    assert.equal(redact("private-test-value-12345"), "[REDACTED]");
  } finally {
    if (prior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prior;
  }
});
