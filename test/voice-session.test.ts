import assert from "node:assert/strict";
import test from "node:test";

import { LoadedVoice, type VoiceWorker } from "../src/voice-session.ts";

test("the Swedish voice stays loaded between replies", async () => {
  let starts = 0;
  const session = new LoadedVoice(() => {
    starts += 1;
    const worker: VoiceWorker = {
      async transcribe(pcm) {
        return `text:${pcm.length}`;
      },
      async speak(text) {
        return Buffer.from(text);
      },
    };
    return worker;
  });

  assert.equal(await session.transcribe(Buffer.from("pcm")), "text:3");
  assert.deepEqual(await session.speak("Hej"), Buffer.from("Hej"));
  assert.deepEqual(await session.speak("Igen"), Buffer.from("Igen"));
  assert.equal(starts, 1);
});
