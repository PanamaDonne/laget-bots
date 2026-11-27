import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readLedgerFile, writeLedgerFile } from "../src/ledger-file.ts";
import { SV } from "../src/swedish.ts";

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
  assert.throws(() => readLedgerFile(root, new Date("2026-11-27T12:00:00.000Z")), /symlink/);
});

test("a ledger file that exists but cannot be parsed stops paid calls", () => {
  const root = mkdtempSync(join(tmpdir(), "radio-days-ledger-"));
  const now = new Date("2026-11-27T12:00:00.000Z");
  const path = join(root, "cost-ledger.json");
  const broken = '{"month":"2026-11","spentOre":98';
  writeFileSync(path, broken);

  assert.throws(() => readLedgerFile(root, now), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, SV.paused);
    assert.equal(error.message.includes("98"), false);
    return true;
  });
  assert.equal(readFileSync(path, "utf8"), broken);
});

test("a ledger that is not a month and an amount stops paid calls", () => {
  const root = mkdtempSync(join(tmpdir(), "radio-days-ledger-"));
  writeFileSync(join(root, "cost-ledger.json"), '{"month":"2026-11","spentOre":"98"}\n');

  assert.throws(
    () => readLedgerFile(root, new Date("2026-11-27T12:00:00.000Z")),
    (error: unknown) => error instanceof Error && error.message === SV.paused,
  );
});

test("the cost counter is replaced by rename, not left as a temp file", () => {
  const root = mkdtempSync(join(tmpdir(), "radio-days-ledger-"));
  writeLedgerFile(root, { month: "2026-11", spentOre: 40 });

  assert.equal(existsSync(join(root, "cost-ledger.json.tmp")), false);
  assert.deepEqual(readLedgerFile(root, new Date("2026-11-27T12:00:00.000Z")), {
    month: "2026-11",
    spentOre: 40,
  });
});
