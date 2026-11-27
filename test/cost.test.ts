import assert from "node:assert/strict";
import test from "node:test";

import { CAP_ORE, WARN_ORE, charge, costOre, stockholmMonth } from "../src/cost.ts";
import { SV } from "../src/swedish.ts";

test("the Stockholm month rolls at local midnight", () => {
  assert.equal(stockholmMonth(new Date("2026-01-31T22:30:00.000Z")), "2026-01");
  assert.equal(stockholmMonth(new Date("2026-01-31T23:30:00.000Z")), "2026-02");
});

test("a new month resets spend and a full cap pauses the next call", () => {
  const paused = charge(
    { month: "2026-11", spentOre: CAP_ORE },
    1,
    new Date("2026-11-27T12:00:00.000Z"),
  );
  assert.equal(paused.allowed, false);
  assert.equal(paused.ledger.spentOre, CAP_ORE);
  assert.equal(paused.notice, SV.paused);

  const reset = charge(
    { month: "2026-11", spentOre: CAP_ORE },
    10,
    new Date("2026-12-01T00:00:00.000Z"),
  );
  assert.equal(reset.allowed, true);
  assert.equal(reset.ledger.month, "2026-12");
  assert.equal(reset.ledger.spentOre, 10);
  assert.equal(reset.notice, null);
});

test("crossing 90 percent warns once and a call that would pass 100 percent is refused", () => {
  const warned = charge(
    { month: "2026-11", spentOre: WARN_ORE - 1 },
    1,
    new Date("2026-11-27T12:00:00.000Z"),
  );
  assert.equal(warned.allowed, true);
  assert.equal(warned.notice, SV.costWarning);

  const again = charge(warned.ledger, 1, new Date("2026-11-27T12:00:00.000Z"));
  assert.equal(again.notice, null);

  const refused = charge(
    { month: "2026-11", spentOre: CAP_ORE - 5 },
    6,
    new Date("2026-11-27T12:00:00.000Z"),
  );
  assert.equal(refused.allowed, false);
  assert.equal(refused.ledger.spentOre, CAP_ORE - 5);
});

test("token cost rounds up in öre", () => {
  assert.equal(costOre(500_000, 200), 100);
  assert.equal(costOre(1, 200), 1);
});
