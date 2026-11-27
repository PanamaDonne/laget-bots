import assert from "node:assert/strict";
import test from "node:test";

import { captureArgs, isSilence, playbackArgs, rms } from "../src/audio.ts";

test("only the audio device changes between the computer and the Pi", () => {
  const desk = captureArgs("default");
  const pi = captureArgs("plughw:1,0");

  assert.deepEqual(
    desk.filter((part) => part !== "default"),
    pi.filter((part) => part !== "plughw:1,0"),
  );
  assert.equal(desk.includes("default"), true);
  assert.equal(pi.includes("plughw:1,0"), true);
  assert.equal(playbackArgs("default", 22050).includes("22050"), true);
  assert.equal(playbackArgs("plughw:1,0", 22050).includes("plughw:1,0"), true);
});

test("silence is a low signal and a raised frame is not", () => {
  const quiet = Buffer.alloc(32);
  const loud = Buffer.alloc(32);
  loud.writeInt16LE(8_000, 0);

  assert.equal(rms(quiet), 0);
  assert.equal(isSilence(quiet, 500), true);
  assert.equal(isSilence(loud, 500), false);
});
