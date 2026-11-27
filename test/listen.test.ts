import assert from "node:assert/strict";
import test from "node:test";

import {
  armAfterHeard,
  audibleSlice,
  decideListen,
  LISTEN_TIMEOUT_MS,
  overlapTail,
  WAKE_WINDOW_BYTES,
} from "../src/listen.ts";

function tone(bytes: number): Buffer {
  const pcm = Buffer.alloc(bytes);
  for (let index = 0; index < pcm.length; index += 2) pcm.writeInt16LE(8_000, index);
  return pcm;
}

test("one wake phrase sends at most one utterance to the model", () => {
  assert.equal(armAfterHeard({ heardArmed: true, spoke: false }), true);
  assert.equal(armAfterHeard({ heardArmed: false, spoke: true }), false);
  assert.equal(armAfterHeard({ heardArmed: true, spoke: true }), false);
});

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

test("a command longer than two seconds waits until the utterance ends", () => {
  const loud = tone(WAKE_WINDOW_BYTES + 16_000 * 2);
  const stillTalking = decideListen({
    armed: false,
    armedAt: null,
    now: 0,
    pending: loud,
    frame: loud.subarray(0, 100),
  });
  assert.equal(stillTalking, "wait");

  const ended = decideListen({
    armed: false,
    armedAt: null,
    now: 0,
    pending: loud,
    frame: Buffer.alloc(100),
  });
  assert.equal(ended, "transcribe");
  assert.equal(overlapTail(loud).length, 16_000 * 2);
});

test("audio from the radio's own playback is dropped and earlier audio is kept", () => {
  const second = 16_000 * 2;
  const echoFrom = 2 * second;
  const echoUntil = echoFrom + 3 * second;
  const before = audibleSlice({
    frameStart: 0,
    frame: tone(2 * second),
    echoFrom,
    echoUntil,
  });
  const during = audibleSlice({
    frameStart: echoFrom,
    frame: tone(2 * second),
    echoFrom,
    echoUntil,
  });

  assert.equal(before?.length, 2 * second);
  assert.equal(during, null);
});
