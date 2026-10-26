import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { CASES, Answer, type CaseId } from "./cases.js";
import { prepareWorkspace, snapshot, FIXED } from "./workspace.js";
import { privateEnv, runProcess } from "./processes.js";
import { toolDecision } from "./policy.js";
import { grade } from "./grader.js";
export async function runCase(
  id: CaseId,
  emit: (e: any) => void,
  controller: AbortController,
) {
  const c = CASES[id],
    w = await prepareWorkspace(),
    started = Date.now(),
    tools: any[] = [],
    observations: any[] = [];
  let result: any = null,
    exception: string | null = null,
    hooks = 0,
    after = w.before,
    tests: any = null,
    cleanupError: string | null = null;
  const observe = (kind: string, detail: any) => {
    const o = { kind, detail, at: new Date().toISOString() };
    observations.push(o);
    emit({ type: "observation", observation: o });
  };
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
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
    tools: c.edit ? ["Read", "Edit"] : ["Read"],
    allowedTools: c.edit ? ["Read", "Edit"] : ["Read"],
    permissionMode: "dontAsk",
    maxTurns: id === "turnlimit" ? 1 : 8,
    maxBudgetUsd: 0.35,
    effort: "low",
    thinking: { type: "disabled" },
    abortController: controller,
    ...(c.grade === "json"
      ? {
          outputFormat: {
            type: "json_schema" as const,
            schema: z.toJSONSchema(Answer, { target: "draft-7" }),
          },
        }
      : {}),
    systemPrompt:
      "You are a classroom evaluation subject. Read only the known fixture files requested. Do not run shell commands or access anything outside the fixture. Follow the fixed task. Be concise; the host independently grades outcomes.",
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PreToolUse") return {};
              hooks++;
              const allow = toolDecision(
                c.edit,
                w.cwd,
                input.tool_name,
                input.tool_input,
              );
              observe("tool-policy", {
                caseId: id,
                tool: input.tool_name,
                decision: allow ? "allow" : "deny",
                input: input.tool_input,
              });
              if (allow) return {};
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: allow ? "allow" : "deny",
                  permissionDecisionReason: "Known evaluation fixture only",
                },
              };
            },
          ],
        },
      ],
    },
  };
  observe("configuration", {
    caseId: id,
    model,
    settingSources: options.settingSources,
    tools: options.tools,
    permissionMode: options.permissionMode,
    maxTurns: options.maxTurns,
    maxBudgetUsd: options.maxBudgetUsd,
    outputFormat: options.outputFormat ?? null,
    workspaceId: w.root.split(/[\\/]/).pop(),
  });
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
          if (block.type === "text") emit({ type: "text", text: block.text });
        }
      if (m.type === "result") {
        result = m;
        emit({ type: "result", result: m });
      }
    }
  } catch (error) {
    exception = String(error);
  } finally {
    run.close();
  }
  try {
    after = await snapshot(w.cwd);
    const fixturesValid = Object.entries(w.before.files).every(
      ([name, text]) =>
        after.files[name] === text ||
        (c.edit && name === "src/utils.js" && after.files[name] === FIXED),
    );
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
        command: "node --test tests/utils.test.mjs",
        ...tests,
      });
    }
    const outcome = grade(id, {
      result,
      fixturesValid,
      tools,
      hooks,
      structured: result?.structured_output,
      tests,
    });
    const record = {
      runId: randomUUID(),
      caseId: id,
      grade: outcome,
      result,
      exception,
      tools,
      observations,
      hooks,
      structured: result?.structured_output ?? null,
      tests,
      fixturesValid,
      fixtureUnchanged: after.hash === w.before.hash,
      beforeHash: w.before.hash,
      afterHash: after.hash,
      sourceBefore: w.before.files["src/utils.js"],
      sourceAfter: after.files["src/utils.js"],
      durationMs: Date.now() - started,
      workspaceId: w.root.split(/[\\/]/).pop(),
      provenance: {
        model,
        sdk: "0.3.310",
        fixtureHash: w.before.hash,
        promptSHA256: createHash("sha256").update(c.prompt).digest("hex"),
        graderVersion: 1,
      },
      cleanupError: cleanupError as string | null,
    };
    try {
      await w.cleanup();
    } catch (error) {
      record.cleanupError = String(error);
      record.grade = { pass: false, why: "Cleanup failed" };
    }
    observe("grade", { caseId: id, ...record.grade });
    return record;
  } catch (error) {
    await w.cleanup();
    throw error;
  }
}
