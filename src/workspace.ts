import { realpathSync } from "node:fs";
import { mkdtemp, mkdir, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const SOURCE =
  "export function average(values) {\n  return values.reduce((a, b) => a + b, 0) / values.length;\n}\n";
export const FIXED = SOURCE.replace(
  "return values.reduce",
  "return values.length === 0 ? 0 : values.reduce",
);
export const NAMES = [
  "README.md",
  "catalog.json",
  "src/utils.js",
  "tests/utils.test.mjs",
  "package.json",
];
export async function snapshot(cwd: string) {
  const files: Record<string, string> = {};
  for (const name of NAMES)
    files[name] = await readFile(join(cwd, name), "utf8");
  return {
    files,
    hash: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
  };
}
export async function prepareWorkspace() {
  const namespace = join(realpathSync.native(tmpdir()), "claude-sdk56");
  await mkdir(namespace, { recursive: true });
  const root = await mkdtemp(join(namespace, "run-")),
    cwd = join(root, "fixture"),
    home = join(root, "home"),
    config = join(root, "config");
  await cp(
    fileURLToPath(new URL("../fixtures/buggy-utils/", import.meta.url)),
    cwd,
    { recursive: true },
  );
  await mkdir(home);
  await mkdir(config);
  return {
    root,
    cwd,
    home,
    config,
    before: await snapshot(cwd),
    cleanup: async () => {
      const inside = relative(resolve(namespace), resolve(root));
      if (!inside || inside.startsWith("..") || isAbsolute(inside))
        throw new Error("Cleanup scope rejected.");
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
      });
    },
  };
}
