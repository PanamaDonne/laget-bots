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
