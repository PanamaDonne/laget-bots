import assert from "node:assert/strict";
import test from "node:test";

import { completeChat } from "../src/provider.ts";
import { runRadioLoop } from "../src/radio-main.ts";
import { SV } from "../src/swedish.ts";

function tone(seconds: number): Buffer {
  const samples = 16_000 * seconds;
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) pcm.writeInt16LE(8_000, index * 2);
  return pcm;
}

async function* spokenTurns(micBytes: { received: number }, turns: number): AsyncGenerator<Buffer> {
  for (let turn = 0; turn < turns; turn += 1) {
    const loud = tone(2);
    const quiet = Buffer.alloc(3_200);
    micBytes.received += loud.length;
    yield loud;
    micBytes.received += quiet.length;
    yield quiet;
  }
}

test("three conversations through the radio loop each get a full token cap", async () => {
  const turns = 3;
  const micBytes = { received: 0 };
  const spoken: string[] = [];
  let fetches = 0;
  const ledger = { month: "2026-11", spentOre: 0 };
  await runRadioLoop({
    frames: spokenTurns(micBytes, turns),
    micBytes,
    transcribe: async () => "Kör Radio vad är klockan",
    complete: (command, usedTokens) =>
      completeChat({
        liveChoice: true,
        apiKey: "fake-key",
        baseUrl: "https://chat.example/v1",
        model: "eu-model",
        providerId: "eu-chat",
        userText: command,
        tokenCap: 4_000,
        usedTokens,
        orePerMillion: 1,
        ledger,
        now: new Date("2026-11-27T12:00:00.000Z"),
        onLedger: (next) => {
          ledger.month = next.month;
          ledger.spentOre = next.spentOre;
        },
        fetchImpl: async () => {
          fetches += 1;
          return Response.json({
            choices: [{ message: { content: "Hej." } }],
            usage: { total_tokens: 2_500 },
          });
        },
      }),
    speak: async (text) => {
      spoken.push(text);
      return { pcm: Buffer.alloc(2), sampleRateHz: 16_000 };
    },
    play: async () => 0,
  });

  assert.equal(turns >= 3, true);
  assert.equal(fetches, turns);
  assert.deepEqual(spoken, ["Hej.", "Hej.", "Hej."]);
  assert.equal(spoken.includes(SV.tokenCap), false);
});

function utterance(micBytes: { received: number }): Buffer[] {
  const loud = tone(2);
  const quiet = Buffer.alloc(3_200);
  micBytes.received += loud.length;
  micBytes.received += quiet.length;
  return [loud, quiet];
}

test("eleven seconds after the wake phrase drops the radio to idle", async () => {
  const rounds = 3;
  let clock = 1_000;
  const micBytes = { received: 0 };
  const heard: string[] = [];
  let sent = 0;
  const frames: Buffer[] = [];
  for (let round = 0; round < rounds; round += 1) {
    frames.push(...utterance(micBytes));
    const tick = Buffer.alloc(320);
    micBytes.received += tick.length;
    frames.push(tick);
    frames.push(...utterance(micBytes));
  }
  const lines = ["Kör Radio", "vad är klockan"];
  await runRadioLoop({
    frames: (async function* generate() {
      let at = 1_000;
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        if (frame !== undefined && frame.length === 320) at += 11_000;
        clock = at;
        if (frame !== undefined) yield frame;
      }
    })(),
    micBytes,
    now: () => clock,
    transcribe: async (pcm) => {
      const line = lines[heard.length % lines.length] ?? "";
      heard.push(line);
      assert.equal(pcm.length > 0, true);
      return line;
    },
    complete: async () => {
      sent += 1;
      return { text: "nej", calledModel: true, usedTokens: 0 };
    },
    speak: async () => ({ pcm: Buffer.alloc(2), sampleRateHz: 16_000 }),
    play: async () => clock,
  });

  assert.equal(rounds >= 3, true);
  assert.equal(heard.length, rounds * 2);
  assert.equal(sent, 0);
});

test("a failed turn returns to idle and later speech is not sent", async () => {
  const rounds = 3;
  const micBytes = { received: 0 };
  const frames: Buffer[] = [];
  for (let round = 0; round < rounds; round += 1) {
    frames.push(...utterance(micBytes));
    frames.push(...utterance(micBytes));
    frames.push(...utterance(micBytes));
  }
  const plan = ["Kör Radio", "throw", "vad är klockan"];
  const heard: string[] = [];
  let sent = 0;
  await runRadioLoop({
    frames: (async function* generate() {
      for (const frame of frames) yield frame;
    })(),
    micBytes,
    transcribe: async () => {
      const step = plan[heard.length % plan.length] ?? "";
      heard.push(step);
      if (step === "throw") throw new Error("stt down");
      return step;
    },
    complete: async () => {
      sent += 1;
      return { text: "nej", calledModel: true, usedTokens: 0 };
    },
    speak: async () => ({ pcm: Buffer.alloc(2), sampleRateHz: 16_000 }),
    play: async () => 0,
  });

  assert.equal(rounds >= 3, true);
  assert.equal(heard.length, rounds * 3);
  assert.equal(sent, 0);
});

test("text without a letter after the wake phrase is not sent", async () => {
  const micBytes = { received: 0 };
  const frames = [
    ...utterance(micBytes),
    ...utterance(micBytes),
    ...utterance(micBytes),
    ...utterance(micBytes),
    ...utterance(micBytes),
  ];
  const lines = ["Kör Radio", "-", "0", "...", "kör radio 2"];
  const heard: string[] = [];
  let sent = 0;
  await runRadioLoop({
    frames: (async function* generate() {
      for (const frame of frames) yield frame;
    })(),
    micBytes,
    transcribe: async () => {
      const line = lines[heard.length] ?? "";
      heard.push(line);
      return line;
    },
    complete: async () => {
      sent += 1;
      return { text: "nej", calledModel: true, usedTokens: 0 };
    },
    speak: async () => ({ pcm: Buffer.alloc(2), sampleRateHz: 16_000 }),
    play: async () => 0,
  });

  assert.deepEqual(heard, lines);
  assert.equal(sent, 0);
});

function chat(onFetch: () => void) {
  const ledger = { month: "2026-11", spentOre: 0 };
  return (command: string, usedTokens: number) =>
    completeChat({
      liveChoice: true,
      apiKey: "fake-key",
      baseUrl: "https://chat.example/v1",
      model: "eu-model",
      providerId: "eu-chat",
      userText: command,
      tokenCap: 4_000,
      usedTokens,
      orePerMillion: 1,
      ledger,
      now: new Date("2026-11-27T12:00:00.000Z"),
      onLedger: (next) => {
        ledger.month = next.month;
        ledger.spentOre = next.spentOre;
      },
      fetchImpl: async () => {
        onFetch();
        return Response.json({
          choices: [{ message: { content: "Hej." } }],
          usage: { total_tokens: 10 },
        });
      },
    });
}

test("the reply path keeps the settled token count", async () => {
  const micBytes = { received: 0 };
  const frames = [...utterance(micBytes), ...utterance(micBytes), ...utterance(micBytes), ...utterance(micBytes)];
  let fetches = 0;
  let heard = 0;
  await runRadioLoop({
    frames: (async function* generate() {
      for (const frame of frames) yield frame;
    })(),
    micBytes,
    usedTokens: 4_500,
    now: () => 1_000,
    transcribe: async () => {
      heard += 1;
      return "Kör Radio vad är klockan";
    },
    complete: chat(() => {
      fetches += 1;
    }),
    speak: async () => ({ pcm: Buffer.alloc(2), sampleRateHz: 16_000 }),
    play: async () => 1_000,
  });

  assert.equal(heard, 4);
  assert.equal(fetches, 3);
});

test("the ten-second wait keeps the settled token count", async () => {
  const micBytes = { received: 0 };
  const wake = utterance(micBytes);
  const tick = Buffer.alloc(320);
  micBytes.received += tick.length;
  const frames = [...wake, tick, ...utterance(micBytes)];
  let clock = 1_000;
  let fetches = 0;
  const lines = ["Kör Radio", "Kör Radio vad är klockan"];
  let heard = 0;
  await runRadioLoop({
    frames: (async function* generate() {
      for (const frame of frames) {
        if (frame.length === 320) clock = 12_000;
        yield frame;
      }
    })(),
    micBytes,
    usedTokens: 4_500,
    now: () => clock,
    transcribe: async () => {
      const line = lines[heard] ?? "";
      heard += 1;
      return line;
    },
    complete: chat(() => {
      fetches += 1;
    }),
    speak: async () => ({ pcm: Buffer.alloc(2), sampleRateHz: 16_000 }),
    play: async () => clock,
  });

  assert.equal(heard, 2);
  assert.equal(fetches, 1);
});

test("a failed turn keeps the settled token count", async () => {
  const micBytes = { received: 0 };
  const frames = [...utterance(micBytes), ...utterance(micBytes), ...utterance(micBytes)];
  const lines = ["Kör Radio", "throw", "Kör Radio vad är klockan"];
  let heard = 0;
  let fetches = 0;
  await runRadioLoop({
    frames: (async function* generate() {
      for (const frame of frames) yield frame;
    })(),
    micBytes,
    usedTokens: 4_500,
    now: () => 1_000,
    transcribe: async () => {
      const line = lines[heard] ?? "";
      heard += 1;
      if (line === "throw") throw new Error("stt down");
      return line;
    },
    complete: chat(() => {
      fetches += 1;
    }),
    speak: async () => ({ pcm: Buffer.alloc(2), sampleRateHz: 16_000 }),
    play: async () => 1_000,
  });

  assert.equal(heard, 3);
  assert.equal(fetches, 1);
});
