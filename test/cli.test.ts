import assert from "node:assert/strict";
import test from "node:test";

import { liveStartupLine, parseRadioArgs } from "../src/cli.ts";
import { SV } from "../src/swedish.ts";

test("live model calls start only from the explicit choice", () => {
  assert.equal(parseRadioArgs([]).liveChoice, false);
  assert.equal(parseRadioArgs(["--audio-device", "default"]).liveChoice, false);
  assert.equal(parseRadioArgs(["--live"]).liveChoice, true);
  assert.equal(parseRadioArgs(["--audio-device", "plughw:1,0"]).audioDevice, "plughw:1,0");
});

test("unknown arguments and an empty audio device are errors", () => {
  assert.throws(() => parseRadioArgs(["--liv"]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, SV.unknownArg);
    return true;
  });
  assert.throws(() => parseRadioArgs(["--live=1"]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, SV.unknownArg);
    return true;
  });
  assert.throws(() => parseRadioArgs(["--audio-device", ""]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, SV.audioMissing);
    return true;
  });
});

test("--live without a key warns before listening", () => {
  assert.equal(liveStartupLine(false, "fake-key"), null);
  assert.equal(liveStartupLine(true, "fake-key"), null);
  assert.equal(liveStartupLine(true, "  "), SV.liveKeyMissing);
  assert.equal(liveStartupLine(true, undefined), SV.liveKeyMissing);
});
