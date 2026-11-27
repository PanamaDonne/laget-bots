import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readLedgerFile, writeLedgerFile } from "../src/ledger-file.ts";

test("the cost counter stores only the month and the amount", () => {
  const root = mkdtempSync(join(tmpdir(), "radio-days-ledger-"));
  const now = new Date("2026-11-27T12:00:00.000Z");

  assert.deepEqual(readLedgerFile(root, now), { month: "2026-11", spentOre: 0 });

  writeLedgerFile(root, { month: "2026-11", spentOre: 120 });
  const saved = readFileSync(join(root, "cost-ledger.json"), "utf8");
  assert.equal(saved.includes("transcript"), false);
  assert.deepEqual(readLedgerFile(root, now), { month: "2026-11", spentOre: 120 });
});

test("the cost counter does not follow a symlink out of its directory", () => {
  const root = mkdtempSync(join(tmpdir(), "radio-days-ledger-"));
  symlinkSync(join(tmpdir(), "outside-ledger.json"), join(root, "cost-ledger.json"));

  assert.throws(() => writeLedgerFile(root, { month: "2026-11", spentOre: 1 }), /symlink/);
});
