import { realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { NAMES, SOURCE, FIXED } from "./workspace.js";
export function toolDecision(
  edit: boolean,
  cwd: string,
  name: string,
  input: any,
) {
  if (name === "StructuredOutput") return true;
  if (!["Read", "Edit"].includes(name) || typeof input.file_path !== "string")
    return false;
  try {
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
      typeof before === "string" &&
      before.length > 0 &&
      SOURCE.includes(before) &&
      SOURCE.replace(before, after) === FIXED
    );
  } catch {
    return false;
  }
}
