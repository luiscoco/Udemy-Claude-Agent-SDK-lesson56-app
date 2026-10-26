import { z } from "zod";
import type { Mode } from "./protocol.js";
export const Answer = z
  .object({ project: z.string(), count: z.number().int() })
  .strict();
export type CaseId =
  | "integration"
  | "structured"
  | "wrongexpected"
  | "fix"
  | "unchanged"
  | "turnlimit";
export const CASES: Record<
  CaseId,
  {
    prompt: string;
    expectedCount?: number;
    grade: "wiring" | "json" | "tests";
    edit: boolean;
  }
> = {
  integration: {
    prompt:
      "Read README.md and report the project marker and what this fixture contains in two sentences.",
    grade: "wiring",
    edit: false,
  },
  structured: {
    prompt:
      "Read catalog.json and return its project marker and the number of items using the supplied structured output schema.",
    expectedCount: 3,
    grade: "json",
    edit: false,
  },
  wrongexpected: {
    prompt:
      "Read catalog.json and return its project marker and the number of items using the supplied structured output schema.",
    expectedCount: 99,
    grade: "json",
    edit: false,
  },
  fix: {
    prompt:
      "Read README.md, src/utils.js and tests/utils.test.mjs. Fix average([]) to return 0 by replacing the single existing return expression with: return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length; Keep every other byte unchanged. The host will independently run the tests. Explain the change briefly.",
    grade: "tests",
    edit: true,
  },
  unchanged: {
    prompt:
      "Read README.md and src/utils.js. Explain why average([]) returns NaN. Do not edit any file. The host will test the unchanged fixture as a deliberate failing control.",
    grade: "tests",
    edit: false,
  },
  turnlimit: {
    prompt:
      "Read README.md first, then read catalog.json and summarize the project and item count.",
    grade: "wiring",
    edit: false,
  },
};
export function plan(mode: Mode): CaseId[] {
  if (mode === "repeated") return ["structured", "structured", "structured"];
  if (mode === "suite") return ["integration", "structured", "fix"];
  if (mode === "gate") return ["integration", "unchanged"];
  return [mode];
}
