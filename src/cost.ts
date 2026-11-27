import { SV } from "./swedish.ts";

export const CAP_ORE = 9_900;
export const WARN_ORE = 8_910;

export type Ledger = {
  month: string;
  spentOre: number;
};

export type ChargeResult = {
  ledger: Ledger;
  allowed: boolean;
  notice: string | null;
};

export function stockholmMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (year === undefined || month === undefined) {
    throw new Error(SV.failed);
  }
  return `${year}-${month}`;
}

export function costOre(tokens: number, orePerMillion: number): number {
  return Math.ceil((tokens * orePerMillion) / 1_000_000);
}

const EARLIEST_MONTH = "2026-01";

function keepLedger(ledger: Ledger): ChargeResult {
  return {
    ledger: { month: ledger.month, spentOre: ledger.spentOre },
    allowed: false,
    notice: SV.clockUnknown,
  };
}

export function charge(ledger: Ledger, cost: number, now: Date): ChargeResult {
  let month: string;
  try {
    month = stockholmMonth(now);
  } catch {
    return keepLedger(ledger);
  }
  if (month < EARLIEST_MONTH || month < ledger.month) return keepLedger(ledger);
  const spent = ledger.month === month ? ledger.spentOre : 0;
  if (cost < 0 || spent + cost > CAP_ORE) {
    return { ledger: { month, spentOre: spent }, allowed: false, notice: SV.paused };
  }
  const next = spent + cost;
  const crossed = spent < WARN_ORE && next >= WARN_ORE;
  return {
    ledger: { month, spentOre: next },
    allowed: true,
    notice: crossed ? SV.costWarning : null,
  };
}
