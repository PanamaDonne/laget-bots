import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Lamp } from "../src/lamp.ts";
import { SV } from "../src/swedish.ts";
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
        return { text: "Den är tre.", calledModel: true, usedTokens: 40 };
      },
      speak: async (text) => {
        spoken.push(text);
        return { firstByteAt: 2_300 };
      },
    }),
  );

  assert.equal(answered.spoke, true);
  assert.equal(answered.reply, "Den är tre.");
  assert.equal(answered.usedTokens, 40);
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

test("a follow-up with no letter is not sent to the model", async () => {
  for (const text of ["-", "0", "...", " - ", "0."]) {
    let called = false;
    const answered = await handleHeard(
      heard({
        text,
        armed: true,
        complete: async () => {
          called = true;
          return { text: "nej", calledModel: true };
        },
      }),
    );
    assert.equal(called, false, text);
    assert.equal(answered.armed, true, text);
    assert.equal(answered.spoke, false, text);
  }
});

test("an empty transcript after the wake phrase does not call the paid model", async () => {
  let called = false;
  const answered = await handleHeard(
    heard({
      text: "   ",
      armed: true,
      complete: async () => {
        called = true;
        return { text: "nej", calledModel: true };
      },
    }),
  );

  assert.equal(called, false);
  assert.equal(answered.armed, true);
  assert.equal(answered.spoke, false);
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

test("a provider error is spoken and the radio stays up", async () => {
  const lamp = new Lamp();
  const spoken: string[] = [];
  const answered = await handleHeard(
    heard({
      lamp,
      text: "Kör Radio hej",
      complete: async () => {
        throw new Error("provider down");
      },
      speak: async (text) => {
        spoken.push(text);
        return { firstByteAt: 1_200 };
      },
    }),
  );

  assert.equal(answered.reply, SV.failed);
  assert.equal(answered.armed, false);
  assert.equal(answered.spoke, true);
  assert.deepEqual(spoken, [SV.failed]);
  assert.equal(lamp.state, "idle");
});

test("a failure to speak still returns the radio to idle", async () => {
  const lamp = new Lamp();
  const answered = await handleHeard(
    heard({
      lamp,
      text: "Kör Radio hej",
      complete: async () => {
        throw new Error("provider down");
      },
      speak: async () => {
        throw new Error("speaker down");
      },
    }),
  );

  assert.equal(answered.armed, false);
  assert.equal(answered.spoke, false);
  assert.equal(lamp.state, "idle");
});

test("kör radio 2 does not send the digit to the model", async () => {
  let called = false;
  const answered = await handleHeard(
    heard({
      text: "kör radio 2",
      complete: async () => {
        called = true;
        return { text: "nej", calledModel: true };
      },
    }),
  );

  assert.equal(called, false);
  assert.equal(answered.armed, true);
  assert.equal(answered.spoke, false);
});

test("the voice worker keeps audio in memory and filters silence", () => {
  const source = readFileSync("scripts/voice-worker.py", "utf8");
  assert.equal(source.includes("NamedTemporaryFile"), false);
  assert.equal(source.includes("tempfile"), false);
  assert.equal(source.includes("vad_filter=True"), true);
  assert.equal(source.includes("local_files_only=offline"), true);
});
