import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Lamp } from "../src/lamp.ts";
import { handleHeard, type HeardInput } from "../src/turn.ts";

function heard(overrides: Partial<HeardInput> = {}): HeardInput {
  return {
    text: "Kör Radio",
    playbackActive: false,
    pushToTalk: false,
    armed: false,
    speechEndedAt: 1_000,
    lamp: new Lamp(),
    complete: async () => {
      throw new Error("complete should not run");
    },
    speak: async () => {
      throw new Error("speak should not run");
    },
    ...overrides,
  };
}

test("a wake followed by Swedish speech speaks one reply and returns to idle", async () => {
  const lamp = new Lamp();
  const woken = await handleHeard(heard({ lamp }));

  assert.equal(woken.armed, true);
  assert.equal(woken.spoke, false);
  assert.equal(lamp.state, "listening");

  const spoken: string[] = [];
  const answered = await handleHeard(
    heard({
      lamp,
      text: "vad är klockan",
      armed: true,
      speechEndedAt: 2_000,
      complete: async (command) => {
        assert.equal(command, "vad är klockan");
        return { text: "Den är tre.", calledModel: true };
      },
      speak: async (text) => {
        spoken.push(text);
        return { firstByteAt: 2_300 };
      },
    }),
  );

  assert.equal(answered.spoke, true);
  assert.equal(answered.reply, "Den är tre.");
  assert.equal(answered.latencyMs, 300);
  assert.deepEqual(spoken, ["Den är tre."]);
  assert.equal(lamp.state, "idle");
  assert.deepEqual(lamp.history, ["idle", "listening", "thinking", "idle"]);
  assert.equal("audio" in answered, false);
});

test("the wake phrase and the question in one breath get one spoken answer", async () => {
  const spoken: string[] = [];
  const answered = await handleHeard(
    heard({
      text: "Kör Radio vad är klockan",
      complete: async (command) => {
        assert.equal(command, "vad är klockan");
        return { text: "Den är tre.", calledModel: false };
      },
      speak: async (text) => {
        spoken.push(text);
        return { firstByteAt: 1_250 };
      },
    }),
  );

  assert.equal(answered.reply, "Den är tre.");
  assert.equal(answered.latencyMs, 250);
  assert.deepEqual(spoken, ["Den är tre."]);
});

test("push-to-talk starts a turn without the wake phrase", async () => {
  const answered = await handleHeard(
    heard({
      text: "hej",
      pushToTalk: true,
      complete: async (command) => ({ text: `svar ${command}`, calledModel: false }),
      speak: async () => ({ firstByteAt: 1_100 }),
    }),
  );

  assert.equal(answered.reply, "svar hej");
  assert.equal(answered.armed, false);
});

test("playback of Kör Radio does not start a turn", async () => {
  let completed = false;
  const answered = await handleHeard(
    heard({
      text: "Kör Radio",
      playbackActive: true,
      complete: async () => {
        completed = true;
        return { text: "nej", calledModel: false };
      },
    }),
  );

  assert.equal(completed, false);
  assert.equal(answered.spoke, false);
  assert.equal(answered.lamp.state, "idle");
});

test("a turn does not write audio or a transcript", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radio-days-turn-"));
  const answered = await handleHeard(
    heard({
      text: "Kör Radio hej",
      complete: async () => ({ text: "Hej.", calledModel: false }),
      speak: async () => ({ firstByteAt: 1_010 }),
    }),
  );

  assert.equal(answered.spoke, true);
  assert.deepEqual(readdirSync(dir), []);
});
