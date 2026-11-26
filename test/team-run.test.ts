import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type { ProviderClient } from "../src/client.ts";
import { ConfiguredProvider, createCustomProvider, toSafeProvider } from "../src/providers.ts";
import { runTeam } from "../src/runner.ts";
import { configureTeam, type ConfiguredTeam } from "../src/team.ts";
import { loadTeamConfig, runTeamFromFile } from "../src/team-run.ts";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

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

function createTestTeam(): ConfiguredTeam {
  const provider = createMockProvider();
  return {
    name: "Testteam",
    description: "Ett team för tester",
    agents: [
      { id: "po-1", roleId: "po", name: "Anna", model: "test-model", provider },
      { id: "dev-1", roleId: "dev", name: "Erik", model: "test-model", provider },
      { id: "reviewer-1", roleId: "reviewer", name: "Lisa", model: "test-model", provider },
    ],
  };
}

function completion(content: string): Awaited<ReturnType<ProviderClient["chatCompletion"]>> {
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
  };
}

function mockReplies(replies: readonly string[]): {
  client: typeof import("../src/client.ts").createClient;
  calls: () => number;
} {
  let calls = 0;
  const provider = toSafeProvider(createMockProvider());
  const client = (() => ({
    provider,
    chatCompletion: async () => {
      calls += 1;
      const content = replies[calls - 1] ?? replies.at(-1) ?? "";
      return completion(content);
    },
  })) as typeof import("../src/client.ts").createClient;
  return { client, calls: () => calls };
}

test("package.json exposes the team command", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.scripts?.team, "node --experimental-strip-types src/team-cli.ts");
});

test("AGENTS.md requires an exact handoff target", () => {
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  assert.match(
    agents,
    /A handoff or question must match an agent id, name or role exactly\. An unknown, empty or ambiguous target is an error, never silent work or first partial match\./,
  );
});

test("loadTeamConfig rejects a team without all three roles", () => {
  const dir = mkdtempSync(join(tmpdir(), "laget-team-"));
  const path = join(dir, "team.json");
  writeFileSync(
    path,
    JSON.stringify({
      namn: "Ofullständigt",
      beskrivning: "Saknar granskare",
      agenter: [
        { id: "po-1", roll: "PO-agent", namn: "Anna" },
        { id: "dev-1", roll: "Dev-agent", namn: "Erik" },
      ],
    }),
  );

  assert.throws(() => loadTeamConfig(path), /Teamet saknar en Gransknings-agent/);
});

test("configureTeam rejects a hand-built team without all three roles", () => {
  assert.throws(
    () =>
      configureTeam(
        {
          name: "Team",
          description: "Test",
          agents: [{ id: "po-1", roleId: "po", name: "Anna" }],
        },
        () => createMockProvider(),
      ),
    /Teamet saknar en Dev-agent/,
  );
});

test("runTeamFromFile shows a mock team run and does not call the network", async () => {
  const lines: string[] = [];
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("live call");
  };

  try {
    const result = await runTeamFromFile(join(root, "example-team.json"), "Bygg en funktion", {
      write: (line) => lines.push(line),
    });
    const output = lines.join("\n");

    assert.equal(result.success, true);
    assert.equal(fetchCalls, 0);
    assert.match(output, /Anna \(PO-agent\) lämnar över/);
    assert.match(output, /Erik \(Dev-agent\) frågar/);
    assert.match(output, /Anna \(PO-agent\) svarar/);
    assert.match(output, /Erik \(Dev-agent\) lämnar över/);
    assert.match(output, /Lisa \(Gransknings-agent\) klar/);
    assert.equal(output.includes("fake-team-demo-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("npm run team prints the example team run without a live model", async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", "src/team-cli.ts", "example-team.json", "Bygg en funktion"],
    { cwd: root },
  );
  const output = `${stdout}\n${stderr}`;

  assert.match(stdout, /Teamkörning: Exempelteam/);
  assert.match(stdout, /Anna \(PO-agent\) lämnar över/);
  assert.match(stdout, /Erik \(Dev-agent\) frågar/);
  assert.match(stdout, /Lisa \(Gransknings-agent\) klar/);
  assert.match(stdout, /slutförde målet/);
  assert.equal(output.includes("fake-team-demo-key"), false);
  assert.equal(output.includes("fake-test-key"), false);
});

test("an unknown handoff target stops the run", async () => {
  const team = createTestTeam();
  const mock = mockReplies(["[LÄMNAR ÖVER TILL Ghost]\nGör något"]);

  const result = await runTeam(team, "Mål", { maxTurns: 20, createClientFn: mock.client });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Okänd mottagare: Ghost/);
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
  assert.equal(result.error?.includes("maxgräns"), false);
});

test("an empty question target stops the run", async () => {
  const team = createTestTeam();
  const mock = mockReplies(["[FRÅGAR ]\nVad menar du?"]);

  const result = await runTeam(team, "Mål", { maxTurns: 20, createClientFn: mock.client });

  assert.equal(result.success, false);
  assert.equal(result.error, "Mottagaren saknas");
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
});

test("an ambiguous role target stops the run", async () => {
  const provider = createMockProvider();
  const team: ConfiguredTeam = {
    name: "Team",
    description: "Test",
    agents: [
      { id: "po-1", roleId: "po", name: "Anna", model: "m", provider },
      { id: "dev-1", roleId: "dev", name: "Erik", model: "m", provider },
      { id: "dev-2", roleId: "dev", name: "Sven", model: "m", provider },
      { id: "reviewer-1", roleId: "reviewer", name: "Lisa", model: "m", provider },
    ],
  };
  const mock = mockReplies(["[LÄMNAR ÖVER TILL Dev-agent]\nImplementera"]);

  const result = await runTeam(team, "Mål", { createClientFn: mock.client });

  assert.equal(result.success, false);
  assert.equal(result.error, "Tvetydig mottagare: Dev-agent");
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
});

test("a reply without a marker stops the run", async () => {
  const team = createTestTeam();
  const mock = mockReplies(["Allt klart! [KLART]\nFärdigt"]);

  const result = await runTeam(team, "Mål", { maxTurns: 20, createClientFn: mock.client });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
});

test("two concurrent runTeam calls on the same team do not run in parallel", async () => {
  const team = createTestTeam();
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const client = (() => ({
    provider: toSafeProvider(team.agents[0]!.provider),
    chatCompletion: async () => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 40));
      inFlight -= 1;
      return completion("[KLART]\nKlar");
    },
  })) as typeof import("../src/client.ts").createClient;

  const first = runTeam(team, "Mål", { createClientFn: client });
  const second = runTeam(team, "Mål", { createClientFn: client });
  const raced = await Promise.race([
    second.then((result) => ({ kind: "second" as const, result })),
    new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 20)),
  ]);

  assert.equal(raced.kind, "second");
  if (raced.kind === "second") {
    assert.equal(raced.result.success, false);
    assert.match(raced.result.error ?? "", /körs redan/);
  }

  const firstResult = await first;
  assert.equal(firstResult.success, true);
  assert.equal(calls, 1);
  assert.equal(maxInFlight, 1);
});
