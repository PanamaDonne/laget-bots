import assert from "node:assert/strict";
import test from "node:test";

import { CAP_ORE } from "../src/cost.ts";
import { CHAT_TIMEOUT_MS, completeChat, type ChatInput } from "../src/provider.ts";
import { SV } from "../src/swedish.ts";

const KEY = "fake-key";
const USER = "MARKER-USER-TEXT";

function input(overrides: Partial<ChatInput> = {}): ChatInput {
  return {
    liveChoice: true,
    apiKey: KEY,
    baseUrl: "https://chat.example/v1",
    model: "eu-model",
    providerId: "eu-chat",
    userText: "vad är klockan",
    tokenCap: 4_000,
    usedTokens: 0,
    orePerMillion: 200,
    ledger: { month: "2026-11", spentOre: 0 },
    now: new Date("2026-11-27T12:00:00.000Z"),
    fetchImpl: async () => {
      throw new Error("fetch was not stubbed");
    },
    ...overrides,
  };
}

function dump(error: Error): string {
  const parts = [error.message, error.stack ?? ""];
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    parts.push(cause.message, cause.stack ?? "");
    cause = cause.cause;
  }
  return parts.join("\n");
}

test("a key without the live choice does not call the provider", async () => {
  let called = false;
  const result = await completeChat(
    input({
      liveChoice: false,
      fetchImpl: async () => {
        called = true;
        return new Response("BODYMARKER", { status: 200 });
      },
    }),
  );

  assert.equal(called, false);
  assert.equal(result.calledModel, false);
  assert.equal(result.text, SV.liveOff);
});

test("a live call sends the utterance and no tools, habits, or audio", async () => {
  let body = "";
  const result = await completeChat(
    input({
      fetchImpl: async (_url, init) => {
        body = String(init?.body);
        return Response.json({
          choices: [{ message: { content: "Den är tre." } }],
          usage: { total_tokens: 40 },
        });
      },
    }),
  );

  assert.equal(result.calledModel, true);
  assert.equal(result.text, "Den är tre.");
  assert.match(body, /vad är klockan/);
  assert.equal(body.includes("tools"), false);
  assert.equal(body.includes("habit"), false);
  assert.equal(body.includes("audio"), false);
  assert.equal(result.ledger.spentOre > 0, true);
});

test("the monthly cap and the conversation cap block the call", async () => {
  let called = false;
  const fetchImpl: ChatInput["fetchImpl"] = async () => {
    called = true;
    return new Response("ok");
  };

  const paused = await completeChat(
    input({ ledger: { month: "2026-11", spentOre: CAP_ORE }, fetchImpl }),
  );
  assert.equal(called, false);
  assert.equal(paused.text, SV.paused);

  called = false;
  const capped = await completeChat(input({ usedTokens: 4_000, fetchImpl }));
  assert.equal(called, false);
  assert.equal(capped.text, SV.tokenCap);
});

test("a call whose measured cost would pass the cap fills the counter", async () => {
  const result = await completeChat(
    input({
      orePerMillion: 1_000_000,
      fetchImpl: async () =>
        Response.json({
          choices: [{ message: { content: "Den är tre." } }],
          usage: { total_tokens: 20_000 },
        }),
    }),
  );

  assert.equal(result.calledModel, true);
  assert.equal(result.ledger.spentOre, CAP_ORE);
});

test("a missing price or model does not call the provider", async () => {
  let called = false;
  const fetchImpl: ChatInput["fetchImpl"] = async () => {
    called = true;
    return new Response("ok");
  };

  const price = await completeChat(input({ orePerMillion: null, fetchImpl }));
  const model = await completeChat(input({ model: "", fetchImpl }));

  assert.equal(called, false);
  assert.equal(price.text, SV.priceMissing);
  assert.equal(model.text, SV.modelMissing);
});

test("HTTP failures keep the provider id and status and drop the body, key, and user text", async () => {
  const key = ` ${KEY} `;
  await assert.rejects(
    () =>
      completeChat(
        input({
          apiKey: key,
          userText: USER,
          fetchImpl: async () => new Response(`BODYMARKER ${KEY} ${USER}`, { status: 401 }),
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const dumped = dump(error);
      assert.match(error.message, /eu-chat/);
      assert.match(error.message, /401/);
      assert.equal(dumped.includes("BODYMARKER"), false);
      assert.equal(dumped.includes(KEY), false);
      assert.equal(dumped.includes(USER), false);
      return true;
    },
  );
});

test("a failed call keeps the reservation that was written before the request", async () => {
  let fetchStarted = false;
  let reservedFirst = false;
  let signal: AbortSignal | undefined;
  await assert.rejects(
    () =>
      completeChat(
        input({
          onLedger: (ledger) => {
            reservedFirst = !fetchStarted && ledger.spentOre > 0;
          },
          fetchImpl: async (_url, init) => {
            fetchStarted = true;
            signal = init?.signal ?? undefined;
            throw new Error("down");
          },
        }),
      ),
  );

  assert.equal(reservedFirst, true);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(CHAT_TIMEOUT_MS, 15_000);
});

test("a network failure is fixed text with the key and user text scrubbed", async () => {
  await assert.rejects(
    () =>
      completeChat(
        input({
          apiKey: ` ${KEY} `,
          userText: USER,
          fetchImpl: async () => {
            const error = new Error(`network ${KEY} ${USER} BODYMARKER`);
            error.cause = new Error(`cause ${KEY} ${USER}`);
            throw error;
          },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const dumped = dump(error);
      assert.equal(error.message, SV.failed);
      assert.equal(dumped.includes(KEY), false);
      assert.equal(dumped.includes(USER), false);
      assert.equal(dumped.includes("BODYMARKER"), false);
      return true;
    },
  );
});
