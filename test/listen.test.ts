import assert from "node:assert/strict";
import test from "node:test";

import { decideListen, LISTEN_TIMEOUT_MS, overlapTail, WAKE_WINDOW_BYTES } from "../src/listen.ts";

function tone(bytes: number): Buffer {
  const pcm = Buffer.alloc(bytes);
  for (let index = 0; index < pcm.length; index += 2) pcm.writeInt16LE(8_000, index);
  return pcm;
}

test("ten seconds after the wake phrase the radio returns to idle", () => {
  const armedAt = 1_000;
  const decision = decideListen({
    armed: true,
    armedAt,
    now: armedAt + LISTEN_TIMEOUT_MS,
    pending: tone(WAKE_WINDOW_BYTES),
    frame: tone(100),
  });

  assert.equal(decision, "disarm");
});

test("silence is not sent to speech recognition", () => {
  const silent = Buffer.alloc(WAKE_WINDOW_BYTES);
  const decision = decideListen({
    armed: false,
    armedAt: null,
    now: 0,
    pending: silent,
    frame: silent.subarray(0, 100),
  });

  assert.equal(decision, "skip-silent");
});

test("a loud window is ready to transcribe and keeps one second of overlap", () => {
  const loud = tone(WAKE_WINDOW_BYTES);
  const decision = decideListen({
    armed: false,
    armedAt: null,
    now: 0,
    pending: loud,
    frame: loud.subarray(0, 100),
  });

  assert.equal(decision, "transcribe");
  assert.equal(overlapTail(loud).length, 16_000 * 2);
});
