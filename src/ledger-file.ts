import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import { CAP_ORE, stockholmMonth, type Ledger } from "./cost.ts";
import { safeWritePath } from "./safe-path.ts";
import { SV } from "./swedish.ts";

const FILE_NAME = "cost-ledger.json";
const TEMP_NAME = "cost-ledger.json.tmp";

export function readLedgerFile(root: string, now: Date): Ledger {
  const path = safeWritePath(root, FILE_NAME);
  if (!existsSync(path)) {
    return { month: stockholmMonth(now), spentOre: 0 };
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(SV.paused);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(SV.paused);
  }
  if (!isLedger(parsed)) throw new Error(SV.paused);
  return { month: parsed.month, spentOre: parsed.spentOre };
}

export function writeLedgerFile(root: string, ledger: Ledger): void {
  mkdirSync(root, { recursive: true });
  const path = safeWritePath(root, FILE_NAME);
  const temp = safeWritePath(root, TEMP_NAME);
  writeFileSync(temp, `${JSON.stringify({ month: ledger.month, spentOre: ledger.spentOre })}\n`);
  renameSync(temp, path);
}

function isLedger(value: unknown): value is Ledger {
  if (typeof value !== "object" || value === null) return false;
  if (!("month" in value) || !("spentOre" in value)) return false;
  const month = value.month;
  const spentOre = value.spentOre;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return false;
  if (typeof spentOre !== "number" || !Number.isInteger(spentOre)) return false;
  return spentOre >= 0 && spentOre <= CAP_ORE;
}
