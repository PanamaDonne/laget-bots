import { lstatSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export function safeWritePath(rootDir: string, name: string): string {
  if (name.length === 0 || name.includes("\0") || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error("Refusing to write outside the directory");
  }
  const root = resolve(rootDir);
  const target = join(root, name);
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (!target.startsWith(prefix)) {
    throw new Error("Refusing to write outside the directory");
  }

  let current = target;
  while (current !== root) {
    let stat: ReturnType<typeof lstatSync> | null = null;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (stat?.isSymbolicLink()) {
      throw new Error("Refusing to follow a symlink");
    }
    current = dirname(current);
  }
  return target;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
