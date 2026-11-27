import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { safeWritePath } from "../src/safe-path.ts";

test("a write path must stay inside the directory and must not follow a symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "radio-days-safe-"));
  const outside = join(tmpdir(), "radio-days-outside");
  writeFileSync(outside, "x");
  symlinkSync(outside, join(root, "escape"));

  const inside = safeWritePath(root, "note.json");
  assert.equal(inside.startsWith(root + "/"), true);

  assert.throws(() => safeWritePath(root, "../note.json"), /outside/);
  assert.throws(() => safeWritePath(root, "escape"), /symlink/);
});
