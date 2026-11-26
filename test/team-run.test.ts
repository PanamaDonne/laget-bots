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
import { configureTeam, parseTeamConfig, type ConfiguredTeam, type TeamConfigInput } from "../src/team.ts";
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

test("AGENTS.md requires an error event when reply parsing fails", () => {
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  assert.match(
    agents,
    /Every failure in parsing the model's reply must produce an error event, not a regular handoff or question event\./,
  );
});

test("AGENTS.md parses a marker only when it is a real marker", () => {
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  assert.match(
    agents,
    /Parse a marker in the model's reply only when it stands alone on its own line, outside code blocks, quotes and inline code\./,
  );
  assert.match(
    agents,
    /A marker that is only mentioned in running text must never end or steer the run\./,
  );
});

test("README documents npm run team", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");

  assert.match(readme, /npm run team/);
  assert.match(readme, /example-team\.json/);
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
    assert.match(output, /\[reviewer\] Klar: Granskningen är godkänd/);
    assert.equal(output.includes("[reviewer] Arbete:"), false);
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

test("a reply with text before the marker is parsed and the run continues", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string; content: string }> = [];
  const mock = mockReplies([
    "Jag har förtydligat målet.\n[LÄMNAR ÖVER TILL Erik]\nImplementera",
    "Implementationen är klar.\n[LÄMNAR ÖVER TILL Lisa]\nGranska",
    "Allt klart!\n[KLART]\nFärdigt",
  ]);

  const result = await runTeam(team, "Mål", {
    maxTurns: 20,
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type, content: event.content }),
  });

  assert.equal(result.success, true);
  assert.equal(result.turns, 3);
  assert.equal(mock.calls(), 3);
  assert.match(result.finalSummary, /\[reviewer\] Klar:/);
  assert.match(result.finalSummary, /Färdigt/);
  assert.equal(result.finalSummary.includes("Arbete"), false);
  assert.equal(events.some((event) => event.type === "handoff"), true);
  assert.equal(events.some((event) => event.type === "done"), true);
  assert.equal(events.some((event) => event.type === "error"), false);
});

test("a reply with no marker stops the run with an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["Jag gjorde arbetet utan markör"]);

  const result = await runTeam(team, "Mål", {
    maxTurns: 20,
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
  assert.equal(result.context.entries.length, 0);
  assert.equal(events.some((event) => event.type === "error"), true);
  assert.equal(events.some((event) => event.type === "handoff" || event.type === "question"), false);
});

test("several markers stop the run with an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string; content: string }> = [];
  const mock = mockReplies(["[KLART]\noch sedan\n[LÄMNAR ÖVER TILL Erik]\nGör det"]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type, content: event.content }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /flera markörer/);
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
  assert.equal(result.context.entries.length, 0);
  const failure = events.find((event) => event.type === "error");
  assert.equal(failure?.content, result.error);
  assert.equal(events.some((event) => event.type === "handoff" || event.type === "done"), false);
});

test("a marker in an indented code block does not end the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["Så här ser det ut:\n    [KLART]\nJag är inte klar än."]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(result.turns, 1);
  assert.equal(events.some((event) => event.type === "done"), false);
});

test("a tab-indented marker does not steer the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["\t[LÄMNAR ÖVER TILL Erik]\nInte än."]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(events.some((event) => event.type === "handoff"), false);
});

test("a marker inside pre does not end the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["<pre>\n[KLART]\n</pre>\nInte klart."]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(events.some((event) => event.type === "done"), false);
});

test("a marker in a code block does not end the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies([
    "Så här ser formatet ut:\n```\n[KLART]\n```\nJag är inte klar än.",
  ]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
  assert.equal(events.some((event) => event.type === "done"), false);
});

test("a marker in a quote does not end the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["> [KLART]\nInte klart."]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(events.some((event) => event.type === "done"), false);
});

test("a marker in inline code does not steer the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["Använd `[LÄMNAR ÖVER TILL Erik]` när du är klar"]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(events.some((event) => event.type === "handoff"), false);
});

test("a marker mentioned in running text does not end the run", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["Jag ska skriva [KLART] sist, men jag har inte börjat"]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(events.some((event) => event.type === "done"), false);
});

test("a reply that only mentions markers does not stop for several markers", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies([
    "Använd [LÄMNAR ÖVER TILL Erik], [FRÅGAR Anna] eller [KLART].",
  ]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /saknar markör/);
  assert.equal(result.error?.includes("flera markörer"), false);
  assert.equal(result.turns, 1);
  assert.equal(
    events.some((event) => event.type === "handoff" || event.type === "question" || event.type === "done"),
    false,
  );
});

test("a real marker still steers the run when other markers are only mentioned", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies([
    "Plan.\n[LÄMNAR ÖVER TILL Erik]\nSkriv [KLART] när du är klar.",
    "[KLART]\nFärdigt",
  ]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, true);
  assert.equal(result.turns, 2);
  assert.equal(mock.calls(), 2);
  assert.equal(events.some((event) => event.type === "handoff"), true);
  assert.equal(events.some((event) => event.type === "done"), true);
  assert.equal(events.some((event) => event.type === "error"), false);
});

test("an NFD marker steers the run like a normal marker", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies([
    "[LÄMNAR ÖVER TILL Erik]\nImplementera".normalize("NFD"),
    "[KLART]\nKlart",
  ]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, true);
  assert.equal(result.turns, 2);
  assert.equal(events.some((event) => event.type === "handoff"), true);
  assert.equal(events.some((event) => event.type === "done"), true);
  assert.equal(events.some((event) => event.type === "error"), false);
});

function routingEvents(events: ReadonlyArray<{ type: string }>): string[] {
  return events
    .filter((event) => event.type === "handoff" || event.type === "question" || event.type === "error")
    .map((event) => event.type);
}

test("self-handoff yields an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string; content: string }> = [];
  const mock = mockReplies(["[LÄMNAR ÖVER TILL Anna]\nJag fortsätter själv"]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type, content: event.content }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /sig själv/);
  assert.equal(result.turns, 1);
  assert.equal(mock.calls(), 1);
  assert.equal(result.context.entries.length, 0);
  assert.deepEqual(routingEvents(events), ["error"]);
  assert.equal(events.find((event) => event.type === "error")?.content, result.error);
});

test("a self-question yields an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string; content: string }> = [];
  const mock = mockReplies([
    "[LÄMNAR ÖVER TILL Erik]\nImplementera",
    "[FRÅGAR Erik]\nSka jag fråga mig?",
  ]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type, content: event.content }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /sig själv/);
  assert.equal(result.turns, 2);
  assert.equal(mock.calls(), 2);
  assert.equal(result.context.entries.length, 1);
  assert.deepEqual(routingEvents(events), ["handoff", "error"]);
  assert.equal(events.find((event) => event.type === "error")?.content, result.error);
});

test("an empty handoff yields an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string; content: string }> = [];
  const mock = mockReplies(["[LÄMNAR ÖVER TILL Erik]"]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type, content: event.content }),
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "Överlämningen måste ha ett innehåll");
  assert.equal(result.turns, 1);
  assert.equal(result.context.entries.length, 0);
  assert.deepEqual(routingEvents(events), ["error"]);
  assert.equal(events.find((event) => event.type === "error")?.content, result.error);
});

test("an empty question yields an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string; content: string }> = [];
  const mock = mockReplies([
    "[LÄMNAR ÖVER TILL Erik]\nImplementera",
    "[FRÅGAR Anna]",
  ]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type, content: event.content }),
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "Frågan måste ha ett innehåll");
  assert.equal(result.turns, 2);
  assert.equal(result.context.entries.length, 1);
  assert.deepEqual(routingEvents(events), ["handoff", "error"]);
  assert.equal(events.find((event) => event.type === "error")?.content, result.error);
});

test("an unknown handoff target yields an error event", async () => {
  const team = createTestTeam();
  const events: Array<{ type: string }> = [];
  const mock = mockReplies(["[LÄMNAR ÖVER TILL Ghost]\nGör något"]);

  const result = await runTeam(team, "Mål", {
    createClientFn: mock.client,
    onTurn: (event) => events.push({ type: event.type }),
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Okänd mottagare/);
  assert.deepEqual(routingEvents(events), ["error"]);
});

function configureNamedTeam(name: string, description: string): ConfiguredTeam {
  const input: TeamConfigInput = {
    namn: name,
    beskrivning: description,
    agenter: [
      { id: "po-1", roll: "PO-agent", namn: "Anna", modell: "test-model" },
      { id: "dev-1", roll: "Dev-agent", namn: "Erik", modell: "test-model" },
      { id: "reviewer-1", roll: "Gransknings-agent", namn: "Lisa", modell: "test-model" },
    ],
  };
  return configureTeam(parseTeamConfig(input), () => createMockProvider());
}

function slowDoneClient(counter: { calls: number; inFlight: number; maxInFlight: number }) {
  return (() => ({
    provider: toSafeProvider(createMockProvider()),
    chatCompletion: async () => {
      counter.calls += 1;
      counter.inFlight += 1;
      counter.maxInFlight = Math.max(counter.maxInFlight, counter.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 40));
      counter.inFlight -= 1;
      return completion("[KLART]\nKlar");
    },
  })) as typeof import("../src/client.ts").createClient;
}

test("two teams from the same config cannot run at the same time", async () => {
  const teamA = configureNamedTeam("Samma config", "Två körningar");
  const teamB = configureNamedTeam("Samma config", "Två körningar");
  assert.notEqual(teamA, teamB);
  const counter = { calls: 0, inFlight: 0, maxInFlight: 0 };
  const client = slowDoneClient(counter);

  const first = runTeam(teamA, "Mål", { createClientFn: client });
  const second = runTeam(teamB, "Mål", { createClientFn: client });
  const raced = await Promise.race([
    second.then((result) => ({ kind: "second" as const, result })),
    new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 20)),
  ]);

  assert.equal(raced.kind, "second");
  if (raced.kind === "second") {
    assert.equal(raced.result.success, false);
    assert.match(raced.result.error ?? "", /körs redan/);
    assert.equal(raced.result.turns, 0);
  }

  const firstResult = await first;
  assert.equal(firstResult.success, true);
  assert.equal(counter.calls, 1);
  assert.equal(counter.maxInFlight, 1);

  const after = await runTeam(teamB, "Mål", { createClientFn: client });
  assert.equal(after.success, true);
  assert.equal(counter.calls, 2);
});

test("two teams from different configs can run at the same time", async () => {
  const teamA = configureNamedTeam("Team A", "Första");
  const teamB = configureNamedTeam("Team B", "Andra");
  const counter = { calls: 0, inFlight: 0, maxInFlight: 0 };
  const client = slowDoneClient(counter);

  const [first, second] = await Promise.all([
    runTeam(teamA, "Mål", { createClientFn: client }),
    runTeam(teamB, "Mål", { createClientFn: client }),
  ]);

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(counter.calls, 2);
  assert.equal(counter.maxInFlight, 2);
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
