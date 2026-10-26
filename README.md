# Claude Agent SDK · Lesson 56 · Testing and evaluating agents

Five student pages, thirteen source-linked UML steps and nine real evaluation experiments.

## What you will learn

- Separate three testing levels: Unit tests call our graders and hooks without a model. Integration checks one real query and its wiring. Evals repeat realistic tasks and measure outcomes.
- Version cases and fixtures: Each case declares a fixed prompt, optional JSON schema, expected outcome and grader. Every real run copies the versioned fixture into a new temporary workspace.
- Grade facts and side effects: Validate native structured output against actual expected fields. Independently run trusted fixture tests after validating all permitted source changes. A fluent success message is not a passing grade.
- Repeat and report: Repeated runs use fresh workspaces. Inspect per-case pass rate, estimated cost, turns and a Wilson interval. Three classroom samples cannot establish production reliability.
- Keep failures visible: Negative controls intentionally fail: an incorrect expected count, an unchanged buggy fixture, a one-turn run and a suite with a failing case. Preserve native results and failed grades.
- Gate changes with evidence: Require each case to reach the 80% observed pass threshold. Keep missing cost fields unknown, retain a JSONL record per run and compare reports with model, prompt and fixture provenance.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson56-app.git
cd .\Udemy-Claude-Agent-SDK-lesson56-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations: `cd .\agent-sdk\lesson56-testing-evals`. Open http://127.0.0.1:3156. Node 24+, model API credit, and Windows Git Bash if required.

## Create your .env file

Preserve the real file locally and enter your own key. Restart after edits. Existing shell values take precedence. No secret is included in source.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3156
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe
```

## Run deterministic unit tests

These tests verify graders, reporting, hooks, fixture isolation and startup without a model call. The fixture test intentionally fails before the known fix and passes afterward.

```powershell
npm test
```

## Run live integration and evals

Integration makes one real SDK query. Repeated makes three independent structured-output runs. Suite runs three different cases. Each copy is removed after grading; evidence stays in the ignored runtime folder.

```powershell
npm run pipeline -- integration
npm run pipeline -- repeated
npm run eval
```

## Inspect deliberate failures and configure CI

Wrongexpected supplies an intentionally incorrect expected count. Unchanged keeps the bug. Turnlimit captures the native limit result. Gate includes a passing integration case and failing fixture case. The repository runs source checks without API secrets; its manual evaluation workflow requires a privately configured ANTHROPIC_API_KEY repository secret. No nightly schedule is enabled.

```powershell
npm run pipeline -- wrongexpected
npm run pipeline -- unchanged
npm run pipeline -- turnlimit
npm run pipeline -- gate
$LASTEXITCODE
# Evidence: .runtime/runs/<suite-id>/runs.jsonl and evidence.json
```

## How the app was built


### 1. Choose a bounded experiment

Validate a fixed mode. Browser input cannot supply shell commands, filesystem paths, prompts or unlimited repetition counts.

Source: src/protocol.ts

```typescript
if (
    !value ||
    Object.keys(value).some((k) => k !== "mode") ||
    !MODES.includes(value.mode)
  )
    throw new Error("Choose a listed evaluation experiment.");
  return { mode: value.mode };
```

### 2. Declare cases and expected outcomes

A case owns its prompt, grading kind, expected values and edit policy. Wrongexpected is a labelled negative control; its intentionally bad expectation is not a model hallucination.

Source: src/cases.ts

```typescript
export const CASES: Record<
  CaseId,
  {
    prompt: string;
    expectedCount?: number;
    grade: "wiring" | "json" | "tests";
    edit: boolean;
  }
> = {
```

### 3. Plan independent repetitions

Repeated runs the same JSON case three times. Suite covers three different cases; Gate deliberately includes a failing outcome. One observed success is not a reliability claim.

Source: src/cases.ts

```typescript
export function plan(mode: Mode): CaseId[] {
  if (mode === "repeated") return ["structured", "structured", "structured"];
  if (mode === "suite") return ["integration", "structured", "fix"];
  if (mode === "gate") return ["integration", "unchanged"];
  return [mode];
}
```

### 4. Copy a fresh versioned fixture

Copy the trusted fixture for every run and isolate the SDK home and config. Empty settings and temporary paths reduce shared state; they are not operating-system isolation or deterministic inference.

Source: src/workspace.ts

```typescript
await cp(
    fileURLToPath(new URL("../fixtures/buggy-utils/", import.meta.url)),
    cwd,
    { recursive: true },
  );
  await mkdir(home);
  await mkdir(config);
```

### 5. Configure the real SDK evaluation

Use the selected model, empty setting sources, explicit tools, dontAsk and finite limits. The model is fixed within a suite. Fixture graders execute locally, separately from the model.

Source: src/runner.ts

```typescript
const options: Options = {
    cwd: w.cwd,
    model,
    env: privateEnv(w),
    settingSources: [],
    plugins: [],
    skills: [],
    mcpServers: {},
    strictMcpConfig: true,
    persistSession: false,
```

### 6. Constrain reads and exact edits

Resolve real paths before allowing known fixture reads. Fix mode admits only the reviewed average-empty-input change. The agent has no Bash or Write tool.

Source: src/policy.ts

```typescript
const base = realpathSync.native(cwd),
      target = realpathSync.native(resolve(base, input.file_path));
    const file = relative(base, target).replaceAll("\\", "/");
    if (isAbsolute(file) || file.startsWith("..") || !NAMES.includes(file))
      return false;
    if (name === "Read") return true;
    if (!edit || file !== "src/utils.js") return false;
    const before = input.old_string,
      after = input.new_string;
    return (
```

### 7. Collect actual native results

Consume the actual SDK stream and preserve its terminal result, requested tools and formatted text. A limit result remains a failure, even if a partial answer exists.

Source: src/runner.ts

```typescript
const run = query({ prompt: c.prompt, options });
  try {
    for await (const m of run) {
      if (m.type === "assistant")
        for (const block of m.message.content) {
          if (block.type === "tool_use") {
            const tool = { name: block.name, id: block.id, input: block.input };
            tools.push(tool);
            observe("native-tool", tool);
          }
```

### 8. Run independent trusted tests

Verify fixture contents first, remove the API key from the host test environment, then execute actual Node tests. Unchanged preserves the bug and must fail this outcome check.

Source: src/runner.ts

```typescript
if (c.grade === "tests" && fixturesValid) {
      const env = privateEnv(w);
      delete env.ANTHROPIC_API_KEY;
      tests = await runProcess(
        process.execPath,
        ["--test", "tests/utils.test.mjs"],
        { cwd: w.cwd, env, signal: controller.signal },
      );
      observe("host-verification", {
        caseId: id,
```

### 9. Grade output facts, not prose

Parse the native structured_output with Zod, then compare project and count to the case expectation. Valid JSON shape is separate from factual correctness. Never grade by exact answer wording.

Source: src/grader.ts

```typescript
const parsed = Answer.safeParse(e.structured);
    if (!parsed.success)
      return { pass: false, why: "Structured output missing or shape invalid" };
    const pass =
      parsed.data.project === "EVAL56" && parsed.data.count === c.expectedCount;
    return {
      pass,
      why: `Expected project EVAL56 and count ${c.expectedCount}; received ${parsed.data.project} and ${parsed.data.count}`,
    };
```

### 10. Retain each completed run

Append the actual graded record to JSONL immediately. Reports retain model, SDK, fixture and prompt provenance. Partial suites cannot pass the final gate.

Source: src/job.ts

```typescript
const run = await runCase(caseId, emit, controller);
    runs.push(run);
    await appendFile(
      join(directory, "runs.jsonl"),
      redact(JSON.stringify(run)) + "\n",
      "utf8",
    );
  }
```

### 11. Aggregate rates, cost and turns

Compute measured averages from native result fields and retain measurement coverage. Missing metrics remain unknown. Wilson intervals show the uncertainty of tiny repeated samples.

Source: src/report.ts

```typescript
const costs = measured("total_cost_usd"),
      turns = measured("num_turns");
    return {
      caseId: id,
      runs: n,
      passed,
      passRate: p,
      wilson95: [Math.max(0, center - spread), Math.min(1, center + spread)],
      avgCostUsd: costs.length
        ? costs.reduce((a, b) => a + b, 0) / costs.length
```

### 12. Gate every case independently

Require every case to reach the observed 80% threshold. A passing easy case cannot hide a failing case behind an overall average. Thresholds express application policy, not statistical proof.

Source: src/report.ts

```typescript
const passed = groups.every((g) => g.passRate >= threshold);
  return {
    threshold,
    groups,
    passed,
    totalRuns: runs.length,
    passedRuns: runs.filter((r) => r.grade.pass).length,
    overallPassRate: runs.filter((r) => r.grade.pass).length / runs.length,
    pipelineExitCode: passed ? 0 : 1,
    interpretation:
```

### 13. Observe the real worker exit

The parent observes the actual operating-system process close event and compares the exit code with the report. The UI shows both native outcomes and the case-level gate decision.

Source: src/agent.ts

```typescript
child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  controller.signal.removeEventListener("abort", cancel);
  const evidence = JSON.parse(
    redact(
      JSON.stringify({
```

### What is real

Integration, Structured, Fix, Repeated and Suite call the real Agent SDK. Negative controls also make real queries. Browser recordings are actual live runs; no canned response replaces model output.

### Versioned classroom task

The fixture has a three-item catalog and a tiny average function with an empty-input bug. Fix may change only its return expression. The agent has Read/Edit; the host runs the trusted tests independently after exact content checks.

### Integration is not an eval score

Integration grades a real Read request, hook observation and successful native result. It checks wiring, not the correctness of arbitrary prose. Structured and fixture-test cases grade declared facts or behavior.

### Negative controls and incomplete runs

Wrongexpected deliberately expects count 99 while the fixture contains 3. Unchanged asks for read-only diagnosis and leaves a failing test. These controls demonstrate graders; they do not measure an agent failing a fair fix task. Turnlimit preserves an actual incomplete SDK result.

### Repeated samples and uncertainty

Repeated uses three genuine fresh runs for a quick teaching demonstration. The report includes a 95% Wilson interval for each observed proportion. Such a small sample cannot establish production reliability; use representative held-out cases and larger repeated samples.

### Costs, turns and missing fields

Native total_cost_usd values are SDK estimates. Averages include only observed numeric fields and show coverage. Missing fields are null rather than invented free runs. The per-run $0.35 estimate threshold may overshoot and is not a hard invoice cap.

### Case-level CI policy

The gate is per case at 80%, not a pooled average. Every planned run must finish. Expected failing modes exit 1. The public workflow runs only deterministic source checks automatically; real hosted evals are manual and need your repository secret.

### Model comparisons and judge grading

Reports include the selected model, prompt hash, fixture hash and grader version. Save reports for both configurations before comparing quality and cost. This app uses deterministic outcome graders; a model judge for fuzzy quality is a future exercise, not a hidden implemented score.

### Primary references

Agent SDK structured output: https://code.claude.com/docs/en/agent-sdk/structured-outputs ; cost fields: https://code.claude.com/docs/en/agent-sdk/cost-tracking ; Node tests: https://nodejs.org/api/test.html
