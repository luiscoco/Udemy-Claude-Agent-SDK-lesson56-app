import { Answer, CASES, type CaseId } from "./cases.js";
export function grade(
  id: CaseId,
  e: {
    result: any;
    fixturesValid: boolean;
    tools: any[];
    hooks: number;
    structured: any;
    tests: any;
  },
) {
  if (e.result?.subtype !== "success" || e.result?.is_error)
    return {
      pass: false,
      why: "Native run incomplete: " + (e.result?.subtype ?? "no result"),
    };
  if (!e.fixturesValid)
    return { pass: false, why: "Unexpected fixture side effects" };
  const c = CASES[id];
  if (c.grade === "wiring")
    return {
      pass: e.hooks > 0 && e.tools.some((t) => t.name === "Read"),
      why: "Require an actual Read request, hook observation and native success",
    };
  if (c.grade === "json") {
    const parsed = Answer.safeParse(e.structured);
    if (!parsed.success)
      return { pass: false, why: "Structured output missing or shape invalid" };
    const pass =
      parsed.data.project === "EVAL56" && parsed.data.count === c.expectedCount;
    return {
      pass,
      why: `Expected project EVAL56 and count ${c.expectedCount}; received ${parsed.data.project} and ${parsed.data.count}`,
    };
  }
  return {
    pass: e.tests?.exitCode === 0,
    why:
      e.tests?.exitCode === 0
        ? "Independent fixture tests pass"
        : "Independent fixture tests fail",
  };
}
