import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { stockholmMonth, type Ledger } from "./cost.ts";
import { safeWritePath } from "./safe-path.ts";

const FILE_NAME = "cost-ledger.json";

export function readLedgerFile(root: string, now: Date): Ledger {
  try {
    const parsed: unknown = JSON.parse(readFileSync(safeWritePath(root, FILE_NAME), "utf8"));
    if (isLedger(parsed)) return { month: parsed.month, spentOre: parsed.spentOre };
  } catch {
    // A missing or unreadable counter starts at zero for this month.
  }
  return { month: stockholmMonth(now), spentOre: 0 };
}

export function writeLedgerFile(root: string, ledger: Ledger): void {
  mkdirSync(root, { recursive: true });
  const path = safeWritePath(root, FILE_NAME);
  writeFileSync(path, `${JSON.stringify({ month: ledger.month, spentOre: ledger.spentOre })}\n`);
}

function isLedger(value: unknown): value is Ledger {
  if (typeof value !== "object" || value === null) return false;
  if (!("month" in value) || !("spentOre" in value)) return false;
  return typeof value.month === "string" && typeof value.spentOre === "number";
}
