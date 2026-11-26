import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MAX_TOKENS,
  estimateMessages,
  estimateTokens,
  MALFORMED_REPLY,
  tokensFromUsage,
} from "../src/budget.ts";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../src/client.ts";
import { createClient } from "../src/client.ts";
import {
  addEntry,
  boundEntryContent,
  createContext,
  createSnapshot,
  DEFAULT_MAX_CONTEXT_ENTRIES,
  DEFAULT_MAX_ENTRY_CHARS,
  summarizeContext,
} from "../src/context.ts";
import { ConfiguredProvider, createCustomProvider, toSafeProvider } from "../src/providers.ts";
import { buildAgentPrompt, createInitialState, formatRunResult, runTeam, type TurnEvent } from "../src/runner.ts";
import { parseTeamCliArgs } from "../src/team-cli.ts";
import { configureTeam, parseTeamConfig, type ConfiguredTeam, type TeamConfigInput } from "../src/team.ts";

const execFileAsync = promisify(execFile);

const root = fileURLToPath(new URL("..", import.meta.url));
const PROVIDER_ENV = ["BERGET_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY", "OPENAI_API_KEY"] as const;

function providerFreeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of PROVIDER_ENV) {
    delete env[key];
  }
  return env;
}

function createMockProvider(): ConfiguredProvider {
  const provider = createCustomProvider({
    id: "test-provider",
    name: "Test Provider",
    endpoint: "http://127.0.0.1/mock",
    region: "SE",
    envKey: "FAKE_TEST_KEY",
    defaultModel: "test-model-v1",
  });
  return new ConfiguredProvider(provider, "fake-test-key-12345");
}

function createTestTeam(limits?: {
  maxTokens?: number;
  maxContextEntries?: number;
  maxEntryChars?: number;
}): ConfiguredTeam {
  const provider = createMockProvider();
  return {
    name: "Testteam",
    description: "Ett team för tester",
    agents: [
      { id: "po-1", roleId: "po", name: "Anna", model: "test-model", provider },
      { id: "dev-1", roleId: "dev", name: "Erik", model: "test-model", provider },
      { id: "reviewer-1", roleId: "reviewer", name: "Lisa", model: "test-model", provider },
    ],
    maxTokens: limits?.maxTokens,
    maxContextEntries: limits?.maxContextEntries,
    maxEntryChars: limits?.maxEntryChars,
  };
}

function teamInput(extra: Partial<TeamConfigInput> = {}): TeamConfigInput {
  return {
    namn: "Testteam",
    beskrivning: "Ett team för tester",
    agenter: [
      { id: "po-1", roll: "PO-agent", namn: "Anna" },
      { id: "dev-1", roll: "Dev-agent", namn: "Erik" },
      { id: "reviewer-1", roll: "Gransknings-agent", namn: "Lisa" },
    ],
    ...extra,
  };
}

function completion(content: string, totalTokens?: number): ChatCompletionResponse {
  return {
    id: "1",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    ...(totalTokens === undefined
      ? {}
      : {
          usage: {
            prompt_tokens: 0,
            completion_tokens: totalTokens,
            total_tokens: totalTokens,
          },
        }),
  };
}

function mockClient(
  reply: (request: ChatCompletionRequest, call: number) => ChatCompletionResponse,
): { client: typeof createClient; calls: () => number; prompts: () => number[] } {
  let calls = 0;
  const prompts: number[] = [];
  const provider = toSafeProvider(createMockProvider());
  const client: typeof createClient = () => ({
    provider,
    chatCompletion: async (request: ChatCompletionRequest) => {
      calls += 1;
      prompts.push(estimateMessages(request.messages));
      return reply(request, calls);
    },
  });
  return { client, calls: () => calls, prompts: () => prompts };
}

function firstPromptTokens(team: ConfiguredTeam, goal: string): number {
  const state = createInitialState(team, goal);
  const agent = team.agents[0];
  if (agent === undefined) {
    throw new Error("Teamet saknar agenter");
  }
  const messages = buildAgentPrompt(agent, team, createSnapshot(state.context), null);
  return estimateMessages(messages);
}

test("estimateTokens rounds up from about four characters", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

test("shared context keeps a fixed window and truncates each entry", () => {
  const context = createContext("Mål", { maxEntries: 3, maxEntryChars: 24 });

  addEntry(context, "po-1", "po", "work", "FORST");
  addEntry(context, "po-1", "po", "work", "y".repeat(200));
  addEntry(context, "dev-1", "dev", "handoff", "andra");
  addEntry(context, "reviewer-1", "reviewer", "done", "SISTA");

  assert.equal(context.entries.length, 3);
  assert.equal(context.omittedCount, 1);
  assert.equal(context.entries[0]?.content, "y".repeat(24 - "… (avkortat)".length) + "… (avkortat)");
  assert.ok((context.entries[0]?.content.length ?? 0) <= 24);
  assert.equal(context.entries[2]?.content, "SISTA");

  const summary = summarizeContext(context);
  assert.match(summary, /Tidigare poster: 1 utelämnad för att hålla kontexten inom taket/);
  assert.equal(summary.includes("FORST"), false);
  assert.match(summary, /SISTA/);
  assert.match(summary, /avkortat/);
});

test("the default context window does not grow with more entries", () => {
  const context = createContext("Mål");
  for (let i = 0; i < DEFAULT_MAX_CONTEXT_ENTRIES; i += 1) {
    addEntry(context, "po-1", "po", "work", `post-${i}`);
  }
  assert.equal(context.entries.length, DEFAULT_MAX_CONTEXT_ENTRIES);
  assert.equal(context.omittedCount, 0);

  addEntry(context, "po-1", "po", "work", "SISTA");
  assert.equal(context.entries.length, DEFAULT_MAX_CONTEXT_ENTRIES);
  assert.equal(context.omittedCount, 1);
  assert.equal(summarizeContext(context).includes("post-0"), false);
  assert.match(summarizeContext(context), /SISTA/);
});

test("a long run keeps the shared summary the same size once the window is full", () => {
  const context = createContext("Bygga en funktion", { maxEntries: 4, maxEntryChars: 50 });
  const body = "x".repeat(5_000);
  for (let i = 0; i < 104; i += 1) {
    addEntry(context, "po-1", "po", "work", `${i}:${body}`);
  }
  const full = summarizeContext(context);
  for (let i = 0; i < 100; i += 1) {
    addEntry(context, "po-1", "po", "work", `${i}:${body}`);
  }
  const later = summarizeContext(context);

  assert.equal(context.entries.length, 4);
  assert.ok(context.entries.every((entry) => entry.content.length <= 50));
  assert.equal(later.length, full.length);
  assert.ok(later.length < 1_000);
  assert.equal(later.includes("x".repeat(51)), false);
});

test("the prompt stays bounded after the context window fills during a run", async () => {
  const team = createTestTeam();
  const body = "x".repeat(2_000);
  const names = ["Erik", "Lisa", "Anna"];
  const mock = mockClient((_request, call) =>
    completion(`[LÄMNAR ÖVER TILL ${names[(call - 1) % names.length]}]\n${body}`),
  );

  const result = await runTeam(team, "Oändligt mål", {
    maxTurns: 8,
    maxContextEntries: 3,
    maxEntryChars: 80,
    createClientFn: mock.client,
  });

  const prompts = mock.prompts();
  assert.equal(prompts.length, 8);
  assert.equal(result.context.entries.length, 3);
  assert.equal(result.context.omittedCount, 5);
  assert.ok(result.context.entries.every((entry) => entry.content.length <= 80));
  const tail = prompts.slice(4);
  const hi = Math.max(...tail);
  const lo = Math.min(...tail);
  assert.ok(hi - lo <= 20);
  assert.ok(hi < (prompts[0] ?? 0) + 250);
});

test("runTeam makes no call when the first prompt would pass the token cap", async () => {
  const team = createTestTeam();
  const goal = "Mål";
  const promptTokens = firstPromptTokens(team, goal);
  const mock = mockClient(() => completion("[KLART]\nKlar"));

  const result = await runTeam(team, goal, {
    maxTokens: promptTokens,
    createClientFn: mock.client,
  });

  assert.equal(mock.calls(), 0);
  assert.equal(result.success, false);
  assert.equal(result.turns, 0);
  assert.equal(result.tokensUsed, 0);
  assert.match(
    result.error ?? "",
    new RegExp(
      `Nådde taket på ${promptTokens} tokens \\(använt 0, nästa anrop cirka ${promptTokens}\\)`,
    ),
  );
  assert.match(result.error ?? "", /kostnaden inte drar iväg/);
  assert.match(formatRunResult(result), /Nådde taket/);
});

test("provider usage stops the run before the next call", async () => {
  const team = createTestTeam();
  const names = ["Erik", "Lisa", "Anna"];
  const mock = mockClient((_request, call) =>
    completion(`[LÄMNAR ÖVER TILL ${names[(call - 1) % names.length]}]\nMer`, 60_000),
  );

  const result = await runTeam(team, "Mål", {
    maxTurns: 10,
    maxTokens: 100_000,
    createClientFn: mock.client,
  });

  assert.equal(mock.calls(), 2);
  assert.equal(result.success, false);
  assert.equal(result.tokensUsed, 120_000);
  assert.match(result.error ?? "", /Nådde taket på 100000 tokens \(använt 120000\)/);
  assert.match(result.error ?? "", /kostnaden inte drar iväg/);
  assert.equal(result.context.entries.length, 2);
});

test("a reported usage below the character estimate cannot extend the run", async () => {
  const team = createTestTeam();
  const goal = "Mål";
  const reply = "[FRÅGAR Erik]\nVilket format?";
  const promptTokens = firstPromptTokens(team, goal);
  const maxTokens = promptTokens + estimateTokens(reply);
  const names = ["Erik", "Lisa", "Anna"];
  const mock = mockClient((_request, call) =>
    completion(`[LÄMNAR ÖVER TILL ${names[(call - 1) % names.length]}]\n${"y".repeat(400)}`, 1),
  );

  const result = await runTeam(team, goal, {
    maxTurns: 8,
    maxTokens,
    createClientFn: mock.client,
  });

  assert.equal(mock.calls(), 1);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Nådde taket/);
  assert.ok((result.tokensUsed ?? 0) >= maxTokens);
});

test("without provider usage the character estimate still enforces the cap", async () => {
  const team = createTestTeam();
  const goal = "Mål";
  const reply = "[FRÅGAR Erik]\nVilket format?";
  const promptTokens = firstPromptTokens(team, goal);
  const mock = mockClient(() => completion(reply));

  const result = await runTeam(team, goal, {
    maxTurns: 6,
    maxTokens: promptTokens + estimateTokens(reply),
    createClientFn: mock.client,
  });

  assert.equal(mock.calls(), 1);
  assert.equal(result.turns, 1);
  assert.equal(result.context.entries.some((entry) => entry.action === "question"), true);
  assert.equal(result.context.entries.some((entry) => entry.action === "answer"), false);
  assert.match(result.error ?? "", /Nådde taket/);
});

test("a question spends a second model call toward the token cap", async () => {
  const team = createTestTeam();
  let calls = 0;
  const provider = toSafeProvider(createMockProvider());
  const client: typeof createClient = () => ({
    provider,
    chatCompletion: async () => {
      calls += 1;
      if (calls === 1) {
        return completion("[FRÅGAR Erik]\nVilket format?", 100);
      }
      return completion("[KLART]\nKlart", 100);
    },
  });

  const goal = "Mål";
  const promptTokens = firstPromptTokens(team, goal);
  const result = await runTeam(team, goal, {
    maxTurns: 5,
    maxTokens: promptTokens + 100 + promptTokens + 50,
    createClientFn: client,
  });

  assert.equal(calls, 2);
  assert.equal(result.turns, 1);
  assert.equal(result.context.entries.some((entry) => entry.action === "question"), true);
  assert.equal(result.context.entries.some((entry) => entry.action === "answer"), true);
  assert.match(result.error ?? "", /Nådde taket/);
  assert.ok((result.tokensUsed ?? 0) >= 200);
});

test("a run under the cap succeeds and reports the provider usage", async () => {
  const team = createTestTeam();
  let seenMaxTokens: number | undefined;
  const mock = mockClient((request) => {
    seenMaxTokens = request.max_tokens;
    return completion("[KLART]\nKlart", 5_000);
  });

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
  });

  assert.equal(result.success, true);
  assert.equal(result.tokensUsed, 5_000);
  assert.equal(mock.calls(), 1);
  assert.equal(seenMaxTokens, DEFAULT_MAX_TOKENS - (mock.prompts()[0] ?? 0));
  assert.match(formatRunResult(result), /Använda tokens: 5000/);
  assert.match(formatRunResult(result), /slutförde målet/);
});

test("a finishing call that goes over the cap still stops with the Swedish message", async () => {
  const team = createTestTeam();
  const mock = mockClient(() => completion("[KLART]\nKlart", 150_000));

  const result = await runTeam(team, "Mål", {
    maxTokens: 100_000,
    createClientFn: mock.client,
  });

  assert.equal(mock.calls(), 1);
  assert.equal(result.success, false);
  assert.equal(result.context.entries.some((entry) => entry.action === "done"), true);
  assert.match(result.error ?? "", /Nådde taket på 100000 tokens \(använt 150000\)/);
  assert.match(formatRunResult(result), /kostnaden inte drar iväg/);
});

test("maxTurns still stops a short loop when the token cap is not reached", async () => {
  const team = createTestTeam();
  const names = ["Erik", "Lisa", "Anna"];
  const mock = mockClient((_request, call) =>
    completion(`[LÄMNAR ÖVER TILL ${names[(call - 1) % names.length]}]\nMer`, 10),
  );

  const result = await runTeam(team, "Mål", {
    maxTurns: 3,
    maxTokens: DEFAULT_MAX_TOKENS,
    createClientFn: mock.client,
  });

  assert.equal(mock.calls(), 3);
  assert.match(result.error ?? "", /maxgräns på 3 omgångar/);
  assert.equal(result.error?.includes("taket"), false);
});

test("an invalid token cap is rejected before any model call", async () => {
  const team = createTestTeam();
  const mock = mockClient(() => completion("[KLART]\nKlar"));

  await assert.rejects(
    () => runTeam(team, "Mål", { maxTokens: 0, createClientFn: mock.client }),
    /Tokentaket måste vara ett positivt heltal/,
  );
  await assert.rejects(
    () => runTeam(team, "Mål", { maxTokens: 1.5, createClientFn: mock.client }),
    /Tokentaket måste vara ett positivt heltal/,
  );
  assert.equal(mock.calls(), 0);
  assert.throws(
    () => createContext("Mål", { maxEntries: 0 }),
    /Antal poster måste vara ett positivt heltal/,
  );
  assert.throws(
    () => createContext("Mål", { maxEntryChars: -2 }),
    /Tecken per post måste vara ett positivt heltal/,
  );
});

test("the team file can set the token cap and the context window", async () => {
  const config = parseTeamConfig(
    teamInput({ maxTokens: 1_000, maxContextEntries: 2, maxEntryChars: 30 }),
  );
  assert.equal(config.maxTokens, 1_000);
  assert.equal(config.maxContextEntries, 2);
  assert.equal(config.maxEntryChars, 30);

  const team = configureTeam(config, () => createMockProvider());
  const names = ["Erik", "Lisa", "Anna"];
  const mock = mockClient((_request, call) =>
    completion(`[LÄMNAR ÖVER TILL ${names[(call - 1) % names.length]}]\n${"z".repeat(400)}`, 10),
  );

  const capped = await runTeam(team, "Mål", {
    maxTurns: 6,
    maxTokens: 100_000,
    createClientFn: mock.client,
  });

  assert.equal(capped.context.entries.length, 2);
  assert.equal(capped.context.limits.maxEntryChars, 30);
  assert.ok(capped.context.entries.every((entry) => entry.content.length <= 30));
  assert.match(capped.context.entries[0]?.content ?? "", /avkortat/);

  const tight = configureTeam(parseTeamConfig(teamInput({ maxTokens: 1 })), () => createMockProvider());
  const blocked = mockClient(() => completion("[KLART]\nKlar"));
  const stopped = await runTeam(tight, "Mål", { createClientFn: blocked.client });
  assert.equal(blocked.calls(), 0);
  assert.match(stopped.error ?? "", /Nådde taket på 1 token /);
});

test("run options override the team file cap", async () => {
  const team = configureTeam(parseTeamConfig(teamInput({ maxTokens: 1 })), () => createMockProvider());
  const mock = mockClient(() => completion("[KLART]\nKlar", 20));

  const result = await runTeam(team, "Mål", {
    maxTokens: 100_000,
    createClientFn: mock.client,
  });

  assert.equal(result.success, true);
  assert.equal(mock.calls(), 1);
});

test("a team file rejects a token cap that is not a positive integer", () => {
  assert.throws(() => parseTeamConfig(teamInput({ maxTokens: 0 })), /Tokentaket måste vara ett positivt heltal/);
  assert.throws(
    () => parseTeamConfig(teamInput({ maxContextEntries: 1.2 })),
    /Antal poster måste vara ett positivt heltal/,
  );
  assert.throws(
    () => parseTeamConfig(teamInput({ maxEntryChars: -1 })),
    /Tecken per post måste vara ett positivt heltal/,
  );
});

test("the request asks the provider to stop within the remaining completion budget", async () => {
  const team = createTestTeam();
  const goal = "Mål";
  const promptTokens = firstPromptTokens(team, goal);
  let seen: number | undefined;
  const mock = mockClient((request) => {
    seen = request.max_tokens;
    return completion("[KLART]\nKlar", 30);
  });

  await runTeam(team, goal, { maxTokens: promptTokens + 25, createClientFn: mock.client });

  assert.equal(seen, 25);
  assert.equal(mock.calls(), 1);
});

test("a null or malformed usage report falls back to the estimate", async () => {
  assert.equal(tokensFromUsage(null), null);
  assert.equal(tokensFromUsage(undefined), null);
  assert.equal(tokensFromUsage({}), null);
  assert.equal(tokensFromUsage("500"), null);
  assert.equal(tokensFromUsage({ total_tokens: "500" }), null);
  assert.equal(tokensFromUsage({ total_tokens: Number.NaN }), null);
  assert.equal(tokensFromUsage({ total_tokens: 12.4 }), 13);

  const team = createTestTeam();
  const goal = "Mål";
  const reply = "[KLART]\nKlar";
  const promptTokens = firstPromptTokens(team, goal);
  const mock = mockClient(() => {
    const response = completion(reply);
    return { ...response, usage: null } as unknown as ChatCompletionResponse;
  });

  const result = await runTeam(team, goal, { createClientFn: mock.client });

  assert.equal(mock.calls(), 1);
  assert.equal(result.success, true);
  assert.equal(result.tokensUsed, promptTokens + estimateTokens(reply));
});

function isWellFormed(text: string): boolean {
  const method = (String.prototype as unknown as { isWellFormed(this: string): boolean }).isWellFormed;
  return method.call(text);
}

test("truncation cuts on code points and does not emit a lone surrogate", () => {
  const mark = "… (avkortat)";
  const source = `aaaa😀${"b".repeat(40)}`;
  assert.equal(isWellFormed(source.slice(0, 5)), false);

  const emoji = boundEntryContent(source, mark.length + 5);
  assert.equal(isWellFormed(emoji), true);
  assert.ok(emoji.length <= mark.length + 5);
  assert.equal(emoji, `aaaa${mark}`);

  const flag = boundEntryContent("🇸🇪".repeat(8), mark.length + 3);
  assert.equal(isWellFormed(flag), true);
  assert.ok(flag.length <= mark.length + 3);
  assert.equal([...flag.slice(0, flag.length - mark.length)].length, 1);
  assert.equal(flag.endsWith(mark), true);

  const context = createContext("Mål", { maxEntries: 2, maxEntryChars: mark.length + 2 });
  addEntry(context, "po-1", "po", "work", "😀".repeat(20));
  const stored = context.entries[0]?.content ?? "";
  assert.equal(isWellFormed(stored), true);
  assert.ok(stored.length <= mark.length + 2);
});

test("a malformed provider response returns a Swedish error instead of throwing", async () => {
  const team = createTestTeam();
  const payloads = [
    { id: null, choices: null, usage: null, model: 4 },
    {
      choices: [{ message: { role: null, content: 12 }, finish_reason: null }],
      usage: { prompt_tokens: null, completion_tokens: "nej", total_tokens: null },
    },
  ];

  for (const payload of payloads) {
    const events: TurnEvent[] = [];
    const mock = mockClient(() => payload as unknown as ChatCompletionResponse);
    const result = await runTeam(team, "Mål", {
      createClientFn: mock.client,
      onTurn: (event) => events.push(event),
    });

    assert.equal(mock.calls(), 1);
    assert.equal(result.success, false);
    assert.equal(result.error, MALFORMED_REPLY);
    assert.equal(
      events.some((event) => event.type === "error" && event.content === MALFORMED_REPLY),
      true,
    );
    assert.equal(typeof result.tokensUsed, "number");
  }
});

test("defaults cover one dev-flow run and a short context window", () => {
  assert.equal(DEFAULT_MAX_TOKENS, 100_000);
  assert.equal(DEFAULT_MAX_CONTEXT_ENTRIES, 12);
  assert.equal(DEFAULT_MAX_ENTRY_CHARS, 2_000);
});

test("AGENTS.md and the README document the token cap and the context bound", () => {
  const agents = readFileSync(`${root}/AGENTS.md`, "utf8");
  const readme = readFileSync(`${root}/README.md`, "utf8");

  assert.match(
    agents,
    /Every team run has a configurable token cap and a bound on shared-context size\. maxTurns limits turns, not model calls or cost\./,
  );
  assert.match(readme, /maxTokens/);
  assert.match(readme, /maxContextEntries/);
  assert.match(readme, /--max-tokens/);
  assert.match(
    agents,
    /Truncate text per code point, never with slice on UTF-16 units\./,
  );
  assert.match(
    agents,
    /Treat every field in the provider response as untrusted: null, missing or wrong type yields the estimate or a Swedish error, never a throw\./,
  );
  assert.match(
    agents,
    /Every failure in parsing the model's reply must produce an error event, not a regular handoff or question event\./,
  );
});

test("the CLI honours --max-tokens and rejects an unknown flag", async () => {
  const capped = parseTeamCliArgs(["example-team.json", "Bygg en funktion", "--max-tokens", "50"]);
  assert.equal(capped.ok, true);
  if (capped.ok) {
    assert.equal(capped.maxTokens, 50);
  }
  assert.equal(parseTeamCliArgs(["example-team.json", "Mål", "--max-tokens", "nej"]).ok, false);
  assert.match(cliError(["example-team.json", "Mål", "--max-tokens"]), /Tokentaket måste vara ett positivt heltal/);
  assert.match(cliError(["example-team.json", "Mål", "--bogus"]), /Okänt argument: --bogus/);

  const stopped = await runCli(["example-team.json", "Bygg en funktion", "--max-tokens", "1"]);
  assert.equal(stopped.code, 1);
  assert.match(`${stopped.stdout}\n${stopped.stderr}`, /Nådde taket på 1 token/);

  const missing = await runCli(["example-team.json", "Bygg en funktion", "--max-tokens"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Tokentaket måste vara ett positivt heltal/);
  assert.equal(missing.stdout.includes("Teamkörning"), false);

  const unknownFlag = await runCli(["example-team.json", "Bygg en funktion", "--bogus"]);
  assert.equal(unknownFlag.code, 1);
  assert.match(unknownFlag.stderr, /Okänt argument: --bogus/);
  assert.equal(unknownFlag.stdout.includes("Teamkörning"), false);
});

function cliError(argv: readonly string[]): string {
  const parsed = parseTeamCliArgs(argv);
  if (parsed.ok) {
    return "";
  }
  return parsed.error;
}

async function runCli(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", "src/team-cli.ts", ...args],
      { cwd: root, env: providerFreeEnv() },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === "number" ? failed.code : 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}
