import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { parseTeamCliArgs } from "../src/team-cli.ts";
import { runTeamFromFile, type TeamRunIO } from "../src/team-run.ts";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const PROVIDER_ENV = ["BERGET_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY", "OPENAI_API_KEY"] as const;

const FAKE_BERGET = "fake-berget-key-277";
const FAKE_MISTRAL = "fake-mistral-key-277";
const FAKE_XAI = "fake-xai-key-277";
const FAKE_FILE = "fake-file-key-277";

type RecordedCall = {
  url: string;
  model: string;
  maxTokens: number | undefined;
  authMatches: boolean;
};

function providerFreeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of PROVIDER_ENV) {
    delete env[key];
  }
  return env;
}

function shows(output: string, needle: string): void {
  assert.equal(output.includes(needle), true, `saknar text: ${needle}`);
}

function hides(output: string, secret: string): void {
  assert.equal(output.includes(secret), false);
}

function authorizationMatches(headers: HeadersInit | undefined, secret: string): boolean {
  if (headers === undefined) {
    return false;
  }
  if (headers instanceof Headers) {
    return headers.get("authorization") === `Bearer ${secret}`;
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([name]) => name.toLowerCase() === "authorization");
    return found?.[1] === `Bearer ${secret}`;
  }
  const record = headers as Record<string, string>;
  const value = record.Authorization ?? record.authorization;
  return value === `Bearer ${secret}`;
}

function readBody(body: BodyInit | null | undefined): { model: string; maxTokens: number | undefined } {
  if (typeof body !== "string") {
    return { model: "", maxTokens: undefined };
  }
  const parsed = JSON.parse(body) as { model?: unknown; max_tokens?: unknown };
  return {
    model: typeof parsed.model === "string" ? parsed.model : "",
    maxTokens: typeof parsed.max_tokens === "number" ? parsed.max_tokens : undefined,
  };
}

function completion(content: string, totalTokens: number): string {
  return JSON.stringify({
    id: "live",
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
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: totalTokens },
  });
}

async function withProviderEnv(keys: Record<string, string>, run: () => Promise<void>): Promise<void> {
  for (const value of Object.values(keys)) {
    if (!value.startsWith("fake-")) {
      throw new Error("tester sätter bara fake-nycklar");
    }
  }
  const saved = PROVIDER_ENV.map((key) => [key, process.env[key]] as const);
  for (const key of PROVIDER_ENV) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(keys)) {
    process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withScriptedFetch(
  keys: Record<string, string>,
  secret: string,
  replies: readonly string[] | ((call: RecordedCall) => Response),
  run: (calls: RecordedCall[]) => Promise<void>,
): Promise<void> {
  const calls: RecordedCall[] = [];
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = readBody(init?.body);
    const call: RecordedCall = {
      url: String(input),
      model: body.model,
      maxTokens: body.maxTokens,
      authMatches: authorizationMatches(init?.headers, secret),
    };
    calls.push(call);
    if (typeof replies === "function") {
      return replies(call);
    }
    const content = replies[index] ?? "";
    index += 1;
    return new Response(completion(content, 20), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withProviderEnv(keys, () => run(calls));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function writeTeam(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "laget-live-"));
  const path = join(dir, "team.json");
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

const exampleTeam = join(root, "example-team.json");

describe("team run against a real provider", { concurrency: false }, () => {
  test("stays on the mock when the named provider has no key", async () => {
    const lines: string[] = [];
    await withScriptedFetch({}, FAKE_BERGET, ["[KLART]\nska inte anropas"], async (calls) => {
      const result = await runTeamFromFile(exampleTeam, "Bygg en funktion", {
        write: (line) => lines.push(line),
      });
      const output = lines.join("\n");

      assert.equal(result.success, true);
      assert.equal(calls.length, 0);
      shows(output, "Leverantör: Mock (ingen nyckel i BERGET_API_KEY)");
      shows(output, "Anna (PO-agent) lämnar över");
      shows(output, "Vilket format ska resultatet ha?");
      hides(output, FAKE_BERGET);
    });
  });

  test("stays on the mock when the team names no provider", async () => {
    const path = writeTeam({
      namn: "Utan leverantör",
      beskrivning: `filen innehåller ${FAKE_FILE} men den får inte användas`,
      agenter: [
        { id: "po-1", roll: "PO-agent", namn: "Anna" },
        { id: "dev-1", roll: "Dev-agent", namn: "Erik" },
        { id: "reviewer-1", roll: "Gransknings-agent", namn: "Lisa" },
      ],
    });
    const lines: string[] = [];
    await withScriptedFetch({ BERGET_API_KEY: FAKE_BERGET }, FAKE_BERGET, ["[KLART]\nnej"], async (calls) => {
      const result = await runTeamFromFile(path, "Mål", { write: (line) => lines.push(line) });
      const output = lines.join("\n");

      assert.equal(result.success, true);
      assert.equal(calls.length, 0);
      assert.equal(
        lines.includes("Leverantör: Mock"),
        true,
      );
      assert.equal(output.includes("ingen nyckel"), false);
      hides(output, FAKE_BERGET);
    });
  });

  test("calls the configured provider and uses each agent's model", async () => {
    const path = writeTeam({
      namn: "Bergetteam",
      beskrivning: `ignorera ${FAKE_FILE}`,
      standardLeverantör: "berget",
      agenter: [
        { id: "po-1", roll: "PO-agent", namn: "Anna", modell: "modell-po" },
        { id: "dev-1", roll: "Dev-agent", namn: "Erik", modell: "modell-dev" },
        { id: "reviewer-1", roll: "Gransknings-agent", namn: "Lisa", modell: "modell-po" },
      ],
    });
    const lines: string[] = [];
    await withScriptedFetch(
      { BERGET_API_KEY: FAKE_BERGET },
      FAKE_BERGET,
      ["[LÄMNAR ÖVER TILL Erik]\nLive-överlämning från po", "[KLART]\nLive-klart från dev"],
      async (calls) => {
        const result = await runTeamFromFile(path, "Bygg en funktion", {
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        assert.equal(result.success, true);
        assert.equal(calls.length, 2);
        assert.equal(calls[0]?.url, "https://api.berget.ai/v1/chat/completions");
        assert.equal(calls[1]?.url, "https://api.berget.ai/v1/chat/completions");
        assert.equal(calls[0]?.model, "modell-po");
        assert.equal(calls[1]?.model, "modell-dev");
        assert.equal(calls.every((call) => call.authMatches), true);
        assert.equal(calls.every((call) => call.maxTokens !== undefined && call.maxTokens > 0), true);
        shows(output, "Leverantörer:");
        shows(output, "Anna: Berget, modell modell-po");
        shows(output, "Erik: Berget, modell modell-dev");
        shows(output, "Live-överlämning från po");
        shows(output, "Live-klart från dev");
        assert.equal(output.includes("Vilket format ska resultatet ha?"), false);
        hides(output, FAKE_BERGET);
        hides(output, FAKE_FILE);
        hides(result.finalSummary, FAKE_BERGET);
        hides(result.error ?? "", FAKE_BERGET);
      },
    );
  });

  test("the command can choose another provider and model", async () => {
    const lines: string[] = [];
    const options: TeamRunIO = {
      providerId: "mistral",
      model: "fake-model-277",
      write: (line) => lines.push(line),
    };
    await withScriptedFetch(
      { BERGET_API_KEY: FAKE_BERGET, MISTRAL_API_KEY: FAKE_MISTRAL },
      FAKE_MISTRAL,
      ["[KLART]\nUnikt live-svar 277"],
      async (calls) => {
        const result = await runTeamFromFile(exampleTeam, "Bygg en funktion", options);
        const output = lines.join("\n");

        assert.equal(result.success, true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.url, "https://api.mistral.ai/v1/chat/completions");
        assert.equal(calls[0]?.model, "fake-model-277");
        assert.equal(calls[0]?.authMatches, true);
        shows(output, "Leverantör: Mistral, modell fake-model-277");
        shows(output, "Unikt live-svar 277");
        assert.equal(output.includes("Vilket format ska resultatet ha?"), false);
        hides(output, FAKE_MISTRAL);
        hides(output, FAKE_BERGET);
      },
    );
  });

  test("flags a non-EU provider in the run output", async () => {
    const lines: string[] = [];
    await withScriptedFetch(
      { XAI_API_KEY: FAKE_XAI },
      FAKE_XAI,
      ["[KLART]\nKlart"],
      async (calls) => {
        await runTeamFromFile(exampleTeam, "Mål", {
          providerId: "grok",
          model: "fake-model-277",
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.url, "https://api.x.ai/v1/chat/completions");
        assert.equal(calls[0]?.authMatches, true);
        shows(output, "Leverantör: Grok (xAI) [non-EU], modell fake-model-277");
        hides(output, FAKE_XAI);
      },
    );
  });

  test("mocks the whole run when one chosen provider has no key", async () => {
    const path = writeTeam({
      namn: "Blandat",
      beskrivning: "Två leverantörer",
      agenter: [
        { id: "po-1", roll: "PO-agent", namn: "Anna", leverantör: "berget", modell: "modell-po" },
        { id: "dev-1", roll: "Dev-agent", namn: "Erik", leverantör: "mistral", modell: "modell-dev" },
        { id: "reviewer-1", roll: "Gransknings-agent", namn: "Lisa", leverantör: "berget", modell: "modell-po" },
      ],
    });
    const lines: string[] = [];
    await withScriptedFetch({ BERGET_API_KEY: FAKE_BERGET }, FAKE_BERGET, ["[KLART]\nnej"], async (calls) => {
      const result = await runTeamFromFile(path, "Mål", { write: (line) => lines.push(line) });
      const output = lines.join("\n");

      assert.equal(result.success, true);
      assert.equal(calls.length, 0);
      shows(output, "Leverantör: Mock (ingen nyckel i MISTRAL_API_KEY)");
      shows(output, "Vilket format ska resultatet ha?");
      hides(output, FAKE_BERGET);
    });
  });

  test("the token cap stops a real provider before another call", async () => {
    const lines: string[] = [];
    const originalFetch = globalThis.fetch;
    const calls: RecordedCall[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = readBody(init?.body);
      calls.push({
        url: String(input),
        model: body.model,
        maxTokens: body.maxTokens,
        authMatches: authorizationMatches(init?.headers, FAKE_BERGET),
      });
      return new Response(completion("[LÄMNAR ÖVER TILL Erik]\nLive-överlämning", 500_000), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await withProviderEnv({ BERGET_API_KEY: FAKE_BERGET }, async () => {
        const result = await runTeamFromFile(exampleTeam, "Bygg en funktion", {
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        assert.equal(result.success, false);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.url, "https://api.berget.ai/v1/chat/completions");
        assert.equal(calls[0]?.model, "google/gemma-4-31B-it");
        assert.equal(calls[0]?.authMatches, true);
        assert.equal(typeof calls[0]?.maxTokens, "number");
        shows(output, "Leverantör: Berget, modell google/gemma-4-31B-it");
        shows(output, "Live-överlämning");
        shows(output, "Nådde taket på 100000 tokens");
        hides(output, FAKE_BERGET);
        hides(result.error ?? "", FAKE_BERGET);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("a token cap of one makes no provider call", async () => {
    const lines: string[] = [];
    await withScriptedFetch({ BERGET_API_KEY: FAKE_BERGET }, FAKE_BERGET, ["[KLART]\nnej"], async (calls) => {
      const result = await runTeamFromFile(exampleTeam, "Bygg en funktion", {
        maxTokens: 1,
        write: (line) => lines.push(line),
      });
      const output = lines.join("\n");

      assert.equal(result.success, false);
      assert.equal(calls.length, 0);
      shows(output, "Leverantör: Berget, modell google/gemma-4-31B-it");
      shows(output, "Nådde taket på 1 token");
      hides(output, FAKE_BERGET);
    });
  });

  test("a provider error and an echoed key stay out of the output", async () => {
    const lines: string[] = [];
    await withScriptedFetch({ BERGET_API_KEY: FAKE_BERGET }, FAKE_BERGET, () => {
      throw new Error(`uppkopplingen misslyckades med ${FAKE_BERGET}`);
    }, async () => {
      const result = await runTeamFromFile(exampleTeam, `Mål ${FAKE_BERGET}`, {
        write: (line) => lines.push(line),
      });
      const output = lines.join("\n");

      assert.equal(result.success, false);
      shows(output, "[REDACTED]");
      shows(output, "Anna (PO-agent) fel:");
      hides(output, FAKE_BERGET);
      hides(result.error ?? "", FAKE_BERGET);
      hides(result.finalSummary, FAKE_BERGET);
      hides(result.context.goal, FAKE_BERGET);
    });

    const echoed: string[] = [];
    await withScriptedFetch(
      { BERGET_API_KEY: FAKE_BERGET },
      FAKE_BERGET,
      [`[KLART]\n${FAKE_BERGET}`],
      async () => {
        const result = await runTeamFromFile(exampleTeam, "Mål", {
          write: (line) => echoed.push(line),
        });
        const output = echoed.join("\n");

        assert.equal(result.success, true);
        shows(output, "[REDACTED]");
        hides(output, FAKE_BERGET);
        hides(result.finalSummary, FAKE_BERGET);
        hides(result.context.entries.map((entry) => entry.content).join("\n"), FAKE_BERGET);
      },
    );

    const rejected: string[] = [];
    await withScriptedFetch({ BERGET_API_KEY: FAKE_BERGET }, FAKE_BERGET, () => {
      return new Response(`{"error":"${FAKE_BERGET}"}`, { status: 401 });
    }, async () => {
      const result = await runTeamFromFile(exampleTeam, "Mål", {
        write: (line) => rejected.push(line),
      });
      const output = rejected.join("\n");

      assert.equal(result.success, false);
      shows(output, "Provider berget returned 401");
      hides(output, FAKE_BERGET);
      hides(result.error ?? "", FAKE_BERGET);
    });
  });

  test("an unknown provider is an error and does not call the network", async () => {
    const lines: string[] = [];
    await withScriptedFetch({ BERGET_API_KEY: FAKE_BERGET }, FAKE_BERGET, ["[KLART]\nnej"], async (calls) => {
      await assert.rejects(
        () =>
          runTeamFromFile(exampleTeam, "Mål", {
            providerId: "nope",
            write: (line) => lines.push(line),
          }),
        /Okänd leverantör: nope/,
      );
      assert.equal(calls.length, 0);
      assert.equal(lines.length, 0);
      hides(lines.join("\n"), FAKE_BERGET);
    });
  });

  test("the CLI can choose a provider and a model and stays on the mock without a key", async () => {
    const parsed = parseTeamCliArgs([
      "example-team.json",
      "Bygg en funktion",
      "--provider",
      "berget",
      "--model",
      "google/gemma-4-31B-it",
      "--max-tokens",
      "50",
    ]);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.providerId, "berget");
      assert.equal(parsed.model, "google/gemma-4-31B-it");
      assert.equal(parsed.maxTokens, 50);
    }

    const equalsForm = parseTeamCliArgs([
      "example-team.json",
      "Mål",
      "--provider=mistral",
      "--model=fake-model-277",
    ]);
    assert.equal(equalsForm.ok, true);
    if (equalsForm.ok) {
      assert.equal(equalsForm.providerId, "mistral");
      assert.equal(equalsForm.model, "fake-model-277");
    }

    assert.equal(parseTeamCliArgs(["example-team.json", "Mål", "--provider"]).ok, false);
    assert.equal(parseTeamCliArgs(["example-team.json", "Mål", "--model"]).ok, false);
    assert.match(cliError(["example-team.json", "Mål", "--provider"]), /Leverantören saknas/);
    assert.match(cliError(["example-team.json", "Mål", "--provider", "--model"]), /Leverantören saknas/);
    assert.match(cliError(["example-team.json", "Mål", "--model"]), /Modellen saknas/);

    const mockRun = await runCli(["example-team.json", "Bygg en funktion", "--provider", "berget"]);
    assert.equal(mockRun.code, 0);
    shows(mockRun.stdout, "Leverantör: Mock (ingen nyckel i BERGET_API_KEY)");
    shows(mockRun.stdout, "Anna (PO-agent) lämnar över");
    hides(mockRun.stdout, FAKE_BERGET);
    hides(mockRun.stderr, FAKE_BERGET);

    const unknown = await runCli(["example-team.json", "Bygg en funktion", "--provider", "nope"]);
    assert.equal(unknown.code, 1);
    shows(unknown.stderr, "Okänd leverantör: nope");
    assert.equal(unknown.stdout.includes("Teamkörning"), false);
  });

  test("the README explains how to run against a real model", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");

    shows(readme, "BERGET_API_KEY");
    shows(readme, "--provider");
    shows(readme, "--model");
    shows(readme, "npm run team");
    assert.equal(readme.includes(FAKE_BERGET), false);
    assert.equal(readme.includes("sk-"), false);
  });
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
