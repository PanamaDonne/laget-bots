import assert from "node:assert/strict";
import test from "node:test";

import { parseRadioArgs } from "../src/cli.ts";

test("live model calls start only from the explicit choice", () => {
  assert.equal(parseRadioArgs([]).liveChoice, false);
  assert.equal(parseRadioArgs(["--audio-device", "default"]).liveChoice, false);
  assert.equal(parseRadioArgs(["--live"]).liveChoice, true);
  assert.equal(parseRadioArgs(["--audio-device", "plughw:1,0"]).audioDevice, "plughw:1,0");
});
