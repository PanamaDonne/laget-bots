import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import { captureArgs, ignoreStreamError, isSilence, playbackArgs, rms, watchMicrophone, whenPlayerExits } from "../src/audio.ts";
import { SV } from "../src/swedish.ts";

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

test("a microphone error ends listening", () => {
  const mic = new EventEmitter();
  let ended = false;
  watchMicrophone(mic, () => {
    ended = true;
  });
  mic.emit("error", new Error("spawn arecord ENOENT"));
  assert.equal(ended, true);
});

test("a player that exits is the Swedish audio line and does not crash", async () => {
  const child = spawn(process.execPath, ["-e", "process.exit(1)"]);
  const stdin = child.stdin;
  if (stdin === null) throw new Error(SV.audioMissing);
  await assert.rejects(whenPlayerExits(child, stdin), { message: SV.audioMissing });
});

test("a closed playback stream reports the error instead of crashing", async () => {
  const stdin = new PassThrough();
  ignoreStreamError(stdin);
  stdin.destroy(new Error("write EPIPE"));
  await new Promise((resolveDone) => {
    setImmediate(resolveDone);
  });
  assert.equal(stdin.destroyed, true);
});

test("silence is a low signal and a raised frame is not", () => {
  const quiet = Buffer.alloc(32);
  const loud = Buffer.alloc(32);
  loud.writeInt16LE(8_000, 0);

  assert.equal(rms(quiet), 0);
  assert.equal(isSilence(quiet, 500), true);
  assert.equal(isSilence(loud, 500), false);
});
