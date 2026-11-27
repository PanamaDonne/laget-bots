import assert from "node:assert/strict";
import test from "node:test";

import { WHISPER_BASE, WHISPER_TINY, whisperModelForMeasurement } from "../src/models.ts";

test("speech-to-text starts at KB-Whisper base", () => {
  assert.equal(WHISPER_BASE, "KBLab/kb-whisper-base");
  assert.equal(whisperModelForMeasurement(null), WHISPER_BASE);
});

test("only a Pi 4 measurement over 3 seconds switches to tiny", () => {
  assert.equal(
    whisperModelForMeasurement({ source: "precheck", latencyMs: 9_000 }),
    WHISPER_BASE,
  );
  assert.equal(
    whisperModelForMeasurement({ source: "pi4", latencyMs: 3_000 }),
    WHISPER_BASE,
  );
  assert.equal(
    whisperModelForMeasurement({ source: "pi4", latencyMs: 3_001 }),
    WHISPER_TINY,
  );
  assert.equal(WHISPER_TINY, "KBLab/kb-whisper-tiny");
});
