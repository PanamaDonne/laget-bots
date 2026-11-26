import assert from "node:assert/strict";
import test from "node:test";

import {
  createContext,
  addEntry,
  getLatestEntries,
  summarizeContext,
  createSnapshot,
} from "../src/context.ts";
import {
  createWorkHandoff,
  createQuestionHandoff,
  validateHandoff,
  executeHandoff,
  parseAgentResponse,
  formatHandoffInstructions,
  recordWork,
  recordAnswer,
} from "../src/handoff.ts";
import {
  listRoles,
  getRole,
  getRoleByName,
  formatRoleLabel,
  formatRoleList,
  isValidRoleId,
} from "../src/roles.ts";
import {
  parseTeamConfig,
  configureTeam,
  getAgentById,
  getAgentsByRole,
  validateTeamConfig,
  formatTeamSummary,
} from "../src/team.ts";
import {
  createInitialState,
  buildAgentPrompt,
  processAgentResponse,
  processAnswerAndResume,
  runTeam,
  formatRunResult,
} from "../src/runner.ts";
import { ConfiguredProvider, createCustomProvider, toSafeProvider } from "../src/providers.ts";
import { createClient } from "../src/client.ts";
import type { ConfiguredTeam, TeamConfig, TeamConfigInput } from "../src/team.ts";
import type { ProviderClient } from "../src/client.ts";

function createMockProvider(id: string = "test-provider"): ConfiguredProvider {
  const provider = createCustomProvider({
    id,
    name: "Test Provider",
    endpoint: "https://api.test.local/v1",
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

test("listRoles returns all three base roles", () => {
  const roles = listRoles();

  assert.equal(roles.length, 3);
  assert.ok(roles.some((r) => r.id === "po"));
  assert.ok(roles.some((r) => r.id === "dev"));
  assert.ok(roles.some((r) => r.id === "reviewer"));
});

test("getRole returns PO role with Swedish descriptions", () => {
  const po = getRole("po");

  assert.equal(po.id, "po");
  assert.equal(po.name, "PO-agent");
  assert.ok(po.description.includes("Produktägare"));
  assert.ok(po.systemPrompt.includes("produktägar-agent"));
  assert.ok(po.capabilities.includes("definiera-mål"));
});

test("getRole returns Dev role with Swedish descriptions", () => {
  const dev = getRole("dev");

  assert.equal(dev.id, "dev");
  assert.equal(dev.name, "Dev-agent");
  assert.ok(dev.description.includes("Utvecklare"));
  assert.ok(dev.systemPrompt.includes("utvecklar-agent"));
  assert.ok(dev.capabilities.includes("implementera"));
});

test("getRole returns Reviewer role with Swedish descriptions", () => {
  const reviewer = getRole("reviewer");

  assert.equal(reviewer.id, "reviewer");
  assert.equal(reviewer.name, "Gransknings-agent");
  assert.ok(reviewer.description.includes("Granskare"));
  assert.ok(reviewer.systemPrompt.includes("gransknings-agent"));
  assert.ok(reviewer.capabilities.includes("granska"));
});

test("getRole throws for unknown role", () => {
  assert.throws(
    () => getRole("unknown" as "po"),
    /Okänd roll/,
  );
});

test("getRoleByName finds role by name", () => {
  const po = getRoleByName("PO-agent");
  assert.ok(po);
  assert.equal(po.id, "po");

  const dev = getRoleByName("Dev-agent");
  assert.ok(dev);
  assert.equal(dev.id, "dev");
});

test("getRoleByName finds role by id", () => {
  const po = getRoleByName("po");
  assert.ok(po);
  assert.equal(po.id, "po");
});

test("getRoleByName returns null for unknown role", () => {
  const unknown = getRoleByName("unknown-role");
  assert.equal(unknown, null);
});

test("isValidRoleId validates known role ids", () => {
  assert.equal(isValidRoleId("po"), true);
  assert.equal(isValidRoleId("dev"), true);
  assert.equal(isValidRoleId("reviewer"), true);
  assert.equal(isValidRoleId("unknown"), false);
});

test("formatRoleLabel formats role with description", () => {
  const po = getRole("po");
  const label = formatRoleLabel(po);

  assert.ok(label.includes("PO-agent"));
  assert.ok(label.includes("Produktägare"));
});

test("formatRoleList formats all roles as a list", () => {
  const roles = listRoles();
  const list = formatRoleList(roles);

  assert.ok(list.includes("- PO-agent"));
  assert.ok(list.includes("- Dev-agent"));
  assert.ok(list.includes("- Gransknings-agent"));
});

test("createContext creates empty context with goal", () => {
  const context = createContext("Bygga en funktion");

  assert.equal(context.goal, "Bygga en funktion");
  assert.equal(context.entries.length, 0);
});

test("addEntry adds entry to context", () => {
  const context = createContext("Mål");

  addEntry(context, "agent-1", "po", "work", "Gjorde något");

  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0]?.agentId, "agent-1");
  assert.equal(context.entries[0]?.roleId, "po");
  assert.equal(context.entries[0]?.action, "work");
  assert.equal(context.entries[0]?.content, "Gjorde något");
  assert.ok(context.entries[0]?.timestamp instanceof Date);
});

test("getLatestEntries returns recent entries", () => {
  const context = createContext("Mål");
  addEntry(context, "a1", "po", "work", "Entry 1");
  addEntry(context, "a2", "dev", "work", "Entry 2");
  addEntry(context, "a3", "reviewer", "work", "Entry 3");

  const latest = getLatestEntries(context, 2);

  assert.equal(latest.length, 2);
  assert.equal(latest[0]?.content, "Entry 2");
  assert.equal(latest[1]?.content, "Entry 3");
});

test("summarizeContext summarizes context in Swedish", () => {
  const context = createContext("Bygga en funktion");
  addEntry(context, "po-1", "po", "work", "Definierade krav");
  addEntry(context, "po-1", "po", "handoff", "Lämnar till dev");

  const summary = summarizeContext(context);

  assert.ok(summary.includes("Mål: Bygga en funktion"));
  assert.ok(summary.includes("Aktivitet:"));
  assert.ok(summary.includes("[po] Arbete: Definierade krav"));
  assert.ok(summary.includes("[po] Lämnar över: Lämnar till dev"));
});

test("summarizeContext handles empty context", () => {
  const context = createContext("Mål");

  const summary = summarizeContext(context);

  assert.ok(summary.includes("Mål: Mål"));
  assert.ok(summary.includes("Ingen aktivitet ännu."));
});

test("createSnapshot creates snapshot with summary and recent entries", () => {
  const context = createContext("Mål");
  addEntry(context, "po-1", "po", "work", "Något");

  const snapshot = createSnapshot(context, 5);

  assert.equal(snapshot.goal, "Mål");
  assert.ok(snapshot.summary.includes("Mål: Mål"));
  assert.equal(snapshot.recentEntries.length, 1);
});

test("parseTeamConfig parses Swedish team config", () => {
  const input: TeamConfigInput = {
    namn: "Mitt Team",
    beskrivning: "Ett bra team",
    agenter: [
      { id: "po-1", roll: "PO-agent", namn: "Anna" },
      { id: "dev-1", roll: "Dev-agent", namn: "Erik" },
      { id: "reviewer-1", roll: "Gransknings-agent", namn: "Lisa" },
    ],
  };

  const config = parseTeamConfig(input);

  assert.equal(config.name, "Mitt Team");
  assert.equal(config.description, "Ett bra team");
  assert.equal(config.agents.length, 3);
  assert.equal(config.agents[0]?.roleId, "po");
  assert.equal(config.agents[1]?.roleId, "dev");
  assert.equal(config.agents[2]?.roleId, "reviewer");
});

test("parseTeamConfig handles Swedish role names", () => {
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "a1", roll: "produktägare", namn: "Anna" },
      { id: "a2", roll: "utvecklare", namn: "Erik" },
      { id: "a3", roll: "granskare", namn: "Lisa" },
    ],
  };

  const config = parseTeamConfig(input);

  assert.equal(config.agents[0]?.roleId, "po");
  assert.equal(config.agents[1]?.roleId, "dev");
  assert.equal(config.agents[2]?.roleId, "reviewer");
});

test("parseTeamConfig throws on missing name", () => {
  const input = {
    beskrivning: "Test",
    agenter: [{ id: "a1", roll: "po", namn: "Anna" }],
  } as unknown as TeamConfigInput;

  assert.throws(
    () => parseTeamConfig(input),
    /Teamet måste ha ett namn/,
  );
});

test("parseTeamConfig throws on missing description", () => {
  const input = {
    namn: "Team",
    agenter: [{ id: "a1", roll: "po", namn: "Anna" }],
  } as unknown as TeamConfigInput;

  assert.throws(
    () => parseTeamConfig(input),
    /Teamet måste ha en beskrivning/,
  );
});

test("parseTeamConfig throws on duplicate agent ids", () => {
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "same-id", roll: "po", namn: "Anna" },
      { id: "same-id", roll: "dev", namn: "Erik" },
    ],
  };

  assert.throws(
    () => parseTeamConfig(input),
    /Dubblett av agent-id/,
  );
});

test("parseTeamConfig throws on unknown role", () => {
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [{ id: "a1", roll: "okänd-roll", namn: "Anna" }],
  };

  assert.throws(
    () => parseTeamConfig(input),
    /Okänd roll/,
  );
});

test("configureTeam configures team with provider", () => {
  const provider = createMockProvider();
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "po-1", roll: "po", namn: "Anna" },
      { id: "dev-1", roll: "dev", namn: "Erik" },
      { id: "reviewer-1", roll: "reviewer", namn: "Lisa" },
    ],
  };
  const config = parseTeamConfig(input);

  const team = configureTeam(config, () => provider);

  assert.equal(team.name, "Team");
  assert.equal(team.agents.length, 3);
  assert.equal(team.agents[0]?.provider.id, "test-provider");
  assert.equal(team.agents[0]?.model, "test-model-v1");
});

test("configureTeam uses agent-specific model when provided", () => {
  const provider = createMockProvider();
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "po-1", roll: "po", namn: "Anna", modell: "custom-model" },
      { id: "dev-1", roll: "dev", namn: "Erik" },
      { id: "reviewer-1", roll: "reviewer", namn: "Lisa" },
    ],
  };
  const config = parseTeamConfig(input);

  const team = configureTeam(config, () => provider);

  assert.equal(team.agents[0]?.model, "custom-model");
});

test("configureTeam throws when provider not found", () => {
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "po-1", roll: "po", namn: "Anna" },
      { id: "dev-1", roll: "dev", namn: "Erik" },
      { id: "reviewer-1", roll: "reviewer", namn: "Lisa" },
    ],
  };
  const config = parseTeamConfig(input);

  assert.throws(
    () => configureTeam(config, () => null),
    /Kunde inte konfigurera provider/,
  );
});

test("getAgentById finds agent by id", () => {
  const team = createTestTeam();

  const agent = getAgentById(team, "dev-1");

  assert.ok(agent);
  assert.equal(agent.id, "dev-1");
  assert.equal(agent.name, "Erik");
});

test("getAgentById returns null for unknown id", () => {
  const team = createTestTeam();

  const agent = getAgentById(team, "unknown");

  assert.equal(agent, null);
});

test("getAgentsByRole finds all agents with role", () => {
  const provider = createMockProvider();
  const team: ConfiguredTeam = {
    name: "Team",
    description: "Test",
    agents: [
      { id: "dev-1", roleId: "dev", name: "Erik", model: "m", provider },
      { id: "dev-2", roleId: "dev", name: "Sven", model: "m", provider },
      { id: "po-1", roleId: "po", name: "Anna", model: "m", provider },
    ],
  };

  const devs = getAgentsByRole(team, "dev");

  assert.equal(devs.length, 2);
  assert.ok(devs.some((a) => a.id === "dev-1"));
  assert.ok(devs.some((a) => a.id === "dev-2"));
});

test("validateTeamConfig reports missing roles", () => {
  const config: TeamConfig = {
    name: "Team",
    description: "Test",
    agents: [{ id: "po-1", roleId: "po", name: "Anna" }],
  };

  const errors = validateTeamConfig(config);

  assert.ok(errors.some((e) => e.includes("Dev-agent")));
  assert.ok(errors.some((e) => e.includes("Gransknings-agent")));
});

test("parseTeamConfig rejects a team that lacks a required role", () => {
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "po-1", roll: "po", namn: "Anna" },
      { id: "dev-1", roll: "dev", namn: "Erik" },
    ],
  };

  assert.throws(
    () => parseTeamConfig(input),
    /Teamet saknar en Gransknings-agent/,
  );
});

test("validateTeamConfig returns empty for complete team", () => {
  const input: TeamConfigInput = {
    namn: "Team",
    beskrivning: "Test",
    agenter: [
      { id: "po-1", roll: "po", namn: "Anna" },
      { id: "dev-1", roll: "dev", namn: "Erik" },
      { id: "reviewer-1", roll: "reviewer", namn: "Lisa" },
    ],
  };
  const config = parseTeamConfig(input);

  const errors = validateTeamConfig(config);

  assert.equal(errors.length, 0);
});

test("formatTeamSummary formats team in Swedish", () => {
  const team = createTestTeam();

  const summary = formatTeamSummary(team);

  assert.ok(summary.includes("Team: Testteam"));
  assert.ok(summary.includes("Beskrivning:"));
  assert.ok(summary.includes("Agenter:"));
  assert.ok(summary.includes("Anna (PO-agent)"));
  assert.ok(summary.includes("Erik (Dev-agent)"));
  assert.ok(summary.includes("Lisa (Gransknings-agent)"));
});

test("createWorkHandoff creates handoff request", () => {
  const handoff = createWorkHandoff("po-1", "dev-1", "Implementera denna funktion");

  assert.equal(handoff.type, "work");
  assert.equal(handoff.fromAgentId, "po-1");
  assert.equal(handoff.toAgentId, "dev-1");
  assert.equal(handoff.content, "Implementera denna funktion");
  assert.equal(handoff.requiresResponse, false);
});

test("createQuestionHandoff creates question request", () => {
  const handoff = createQuestionHandoff("dev-1", "po-1", "Vad menar du med X?");

  assert.equal(handoff.type, "question");
  assert.equal(handoff.fromAgentId, "dev-1");
  assert.equal(handoff.toAgentId, "po-1");
  assert.equal(handoff.content, "Vad menar du med X?");
  assert.equal(handoff.requiresResponse, true);
});

test("validateHandoff accepts valid handoff", () => {
  const team = createTestTeam();
  const handoff = createWorkHandoff("po-1", "dev-1", "Något arbete");

  const result = validateHandoff(handoff, team);

  assert.equal(result.accepted, true);
  assert.ok(result.targetAgent);
  assert.equal(result.targetAgent.id, "dev-1");
});

test("validateHandoff rejects unknown sender", () => {
  const team = createTestTeam();
  const handoff = createWorkHandoff("unknown", "dev-1", "Något");

  const result = validateHandoff(handoff, team);

  assert.equal(result.accepted, false);
  assert.ok(result.error?.includes("Okänd avsändare"));
});

test("validateHandoff rejects unknown receiver", () => {
  const team = createTestTeam();
  const handoff = createWorkHandoff("po-1", "unknown", "Något");

  const result = validateHandoff(handoff, team);

  assert.equal(result.accepted, false);
  assert.ok(result.error?.includes("Okänd mottagare"));
});

test("validateHandoff rejects self-handoff", () => {
  const team = createTestTeam();
  const handoff = createWorkHandoff("po-1", "po-1", "Något");

  const result = validateHandoff(handoff, team);

  assert.equal(result.accepted, false);
  assert.ok(result.error?.includes("sig själv"));
});

test("validateHandoff rejects empty content", () => {
  const team = createTestTeam();
  const handoff = createWorkHandoff("po-1", "dev-1", "   ");

  const result = validateHandoff(handoff, team);

  assert.equal(result.accepted, false);
  assert.ok(result.error?.includes("innehåll"));
});

test("executeHandoff records entry in context", () => {
  const team = createTestTeam();
  const context = createContext("Mål");
  const handoff = createWorkHandoff("po-1", "dev-1", "Implementera X");

  executeHandoff(handoff, team, context);

  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0]?.action, "handoff");
  assert.equal(context.entries[0]?.content, "Implementera X");
});

test("executeHandoff records question in context", () => {
  const team = createTestTeam();
  const context = createContext("Mål");
  const question = createQuestionHandoff("dev-1", "po-1", "Vad menar du?");

  executeHandoff(question, team, context);

  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0]?.action, "question");
});

test("recordWork adds work entry to context", () => {
  const team = createTestTeam();
  const context = createContext("Mål");

  recordWork("dev-1", team, context, "Implementerade funktionen");

  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0]?.action, "work");
  assert.equal(context.entries[0]?.agentId, "dev-1");
});

test("recordAnswer adds answer entry to context", () => {
  const team = createTestTeam();
  const context = createContext("Mål");

  recordAnswer("po-1", team, context, "Jag menar att...");

  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0]?.action, "answer");
});

test("parseAgentResponse rejects a reply without a marker", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse("Jag arbetade med detta.", team);

  assert.equal(parsed.type, "invalid");
  assert.match(parsed.error ?? "", /saknar markör/);
});

test("parseAgentResponse accepts text before a done marker", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse("Allt klart! [KLART]\nFärdigt", team);

  assert.equal(parsed.type, "done");
  assert.equal(parsed.error, undefined);
  assert.match(parsed.content, /Färdigt/);
  assert.match(parsed.content, /Allt klart!/);
});

test("parseAgentResponse accepts text before a handoff", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "Jag har förtydligat målet.\n[LÄMNAR ÖVER TILL Erik]\nImplementera",
    team,
  );

  assert.equal(parsed.type, "handoff");
  assert.equal(parsed.targetAgentId, "dev-1");
  assert.match(parsed.content, /förtydligat/);
  assert.match(parsed.content, /Implementera/);
});

test("parseAgentResponse accepts text before a question", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "En sak är oklar.\n[FRÅGAR Anna]\nVilken typ?",
    team,
  );

  assert.equal(parsed.type, "question");
  assert.equal(parsed.targetAgentId, "po-1");
  assert.match(parsed.content, /oklar/);
  assert.match(parsed.content, /Vilken typ/);
});

test("parseAgentResponse still rejects a partial target after preamble", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse("Hej [LÄMNAR ÖVER TILL agent]\nGör det", team);

  assert.equal(parsed.type, "invalid");
  assert.match(parsed.error ?? "", /Okänd mottagare/);
});

test("parseAgentResponse accepts a lowercase marker", () => {
  const team = createTestTeam();

  const done = parseAgentResponse("Allt klart! [klart]\nFärdigt", team);
  const handoff = parseAgentResponse("[lämnar över till erik]\nImplementera", team);
  const question = parseAgentResponse("[frågar anna]\nVilken typ?", team);

  assert.equal(done.type, "done");
  assert.match(done.content, /Färdigt/);
  assert.equal(handoff.type, "handoff");
  assert.equal(handoff.targetAgentId, "dev-1");
  assert.equal(question.type, "question");
  assert.equal(question.targetAgentId, "po-1");
});

test("parseAgentResponse rejects several markers", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "Först [KLART] och sedan\n[LÄMNAR ÖVER TILL Erik]\nGör det",
    team,
  );

  assert.equal(parsed.type, "invalid");
  assert.match(parsed.error ?? "", /flera markörer/);
});

test("parseAgentResponse rejects an empty target", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse("[FRÅGAR ]\nVad menar du?", team);

  assert.equal(parsed.type, "invalid");
  assert.equal(parsed.error, "Mottagaren saknas");
});

test("parseAgentResponse rejects a partial target", () => {
  const team = createTestTeam();

  const byFragment = parseAgentResponse("[LÄMNAR ÖVER TILL agent]\nGör det", team);
  const byPrefix = parseAgentResponse("[FRÅGAR an]\nHej?", team);

  assert.equal(byFragment.type, "invalid");
  assert.match(byFragment.error ?? "", /Okänd mottagare/);
  assert.equal(byPrefix.type, "invalid");
  assert.match(byPrefix.error ?? "", /Okänd mottagare/);
});

test("parseAgentResponse matches a role alias exactly", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse("[LÄMNAR ÖVER TILL Granskare]\nKontrollera", team);

  assert.equal(parsed.type, "handoff");
  assert.equal(parsed.targetAgentId, "reviewer-1");
});

test("parseAgentResponse matches a name regardless of case", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse("[LÄMNAR ÖVER TILL erik]\nImplementera", team);

  assert.equal(parsed.type, "handoff");
  assert.equal(parsed.targetAgentId, "dev-1");
});

test("parseAgentResponse parses handoff by agent name", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "[LÄMNAR ÖVER TILL Erik]\nImplementera denna funktion",
    team,
  );

  assert.equal(parsed.type, "handoff");
  assert.equal(parsed.targetAgentId, "dev-1");
  assert.equal(parsed.content, "Implementera denna funktion");
});

test("parseAgentResponse parses handoff by role name", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "[LÄMNAR ÖVER TILL Dev-agent]\nImplementera detta",
    team,
  );

  assert.equal(parsed.type, "handoff");
  assert.equal(parsed.targetAgentId, "dev-1");
});

test("parseAgentResponse parses question", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "[FRÅGAR Anna]\nVad menar du med kravet?",
    team,
  );

  assert.equal(parsed.type, "question");
  assert.equal(parsed.targetAgentId, "po-1");
  assert.equal(parsed.content, "Vad menar du med kravet?");
});

test("parseAgentResponse parses done", () => {
  const team = createTestTeam();

  const parsed = parseAgentResponse(
    "[KLART]\nArbetet är slutfört",
    team,
  );

  assert.equal(parsed.type, "done");
  assert.equal(parsed.content, "Arbetet är slutfört");
});

test("formatHandoffInstructions includes all agents", () => {
  const team = createTestTeam();

  const instructions = formatHandoffInstructions(team);

  assert.ok(instructions.includes("Anna (PO-agent)"));
  assert.ok(instructions.includes("Erik (Dev-agent)"));
  assert.ok(instructions.includes("Lisa (Gransknings-agent)"));
  assert.ok(instructions.includes("[LÄMNAR ÖVER TILL"));
  assert.ok(instructions.includes("[FRÅGAR"));
  assert.ok(instructions.includes("[KLART]"));
});

test("createInitialState creates state with first agent", () => {
  const team = createTestTeam();

  const state = createInitialState(team, "Bygga en app");

  assert.equal(state.context.goal, "Bygga en app");
  assert.equal(state.currentAgentId, "po-1");
  assert.equal(state.pendingQuestion, null);
  assert.equal(state.turn, 0);
  assert.equal(state.done, false);
  assert.equal(state.error, null);
});

test("createInitialState uses specified start agent", () => {
  const team = createTestTeam();

  const state = createInitialState(team, "Mål", "dev-1");

  assert.equal(state.currentAgentId, "dev-1");
});

test("buildAgentPrompt includes role system prompt", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Bygga en app");
  const agent = team.agents[0]!;
  const snapshot = createSnapshot(state.context);

  const messages = buildAgentPrompt(agent, team, snapshot, null);

  assert.equal(messages[0]?.role, "system");
  assert.ok(messages[0]?.content.includes("produktägar-agent"));
  assert.ok(messages[0]?.content.includes("[LÄMNAR ÖVER TILL"));
});

test("buildAgentPrompt includes pending question when present", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål");
  const agent = team.agents[0]!;
  const snapshot = createSnapshot(state.context);
  const pendingQuestion = { fromAgentId: "dev-1", question: "Vad menar du?" };

  const messages = buildAgentPrompt(agent, team, snapshot, pendingQuestion);

  assert.ok(messages[1]?.content.includes("frågar dig"));
  assert.ok(messages[1]?.content.includes("Vad menar du?"));
});

test("processAgentResponse stops on a reply without a marker", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål");
  const agent = team.agents[0]!;

  const newState = processAgentResponse(agent, team, state, "Jag gjorde något.");

  assert.equal(newState.turn, 1);
  assert.match(newState.error ?? "", /saknar markör/);
  assert.equal(newState.context.entries.length, 0);
});

test("processAgentResponse handles handoff response", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål");
  const agent = team.agents[0]!;

  const newState = processAgentResponse(
    agent,
    team,
    state,
    "[LÄMNAR ÖVER TILL Erik]\nImplementera detta",
  );

  assert.equal(newState.currentAgentId, "dev-1");
  assert.equal(newState.context.entries.length, 1);
  assert.equal(newState.context.entries[0]?.action, "handoff");
});

test("processAgentResponse handles question response", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål");
  state.currentAgentId = "dev-1";
  const agent = team.agents[1]!;

  const newState = processAgentResponse(
    agent,
    team,
    state,
    "[FRÅGAR Anna]\nVad menar du med kravet?",
  );

  assert.equal(newState.currentAgentId, "po-1");
  assert.ok(newState.pendingQuestion);
  assert.equal(newState.pendingQuestion.fromAgentId, "dev-1");
  assert.equal(newState.pendingQuestion.question, "Vad menar du med kravet?");
});

test("processAgentResponse handles done response", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål");
  const agent = team.agents[0]!;

  const newState = processAgentResponse(
    agent,
    team,
    state,
    "[KLART]\nMålet är uppnått",
  );

  assert.equal(newState.done, true);
  assert.equal(newState.context.entries.length, 1);
});

test("processAgentResponse records a finished reply as klar", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål", "reviewer-1");
  const agent = team.agents[2]!;

  const newState = processAgentResponse(
    agent,
    team,
    state,
    "[KLART]\nGranskningen är godkänd",
  );

  assert.equal(newState.done, true);
  assert.equal(newState.context.entries[0]?.action, "done");
  const summary = summarizeContext(newState.context);
  assert.match(summary, /\[reviewer\] Klar: Granskningen är godkänd/);
  assert.equal(summary.includes("Arbete"), false);
});

test("processAnswerAndResume returns to asking agent", () => {
  const team = createTestTeam();
  const state = createInitialState(team, "Mål");
  state.currentAgentId = "po-1";
  state.pendingQuestion = { fromAgentId: "dev-1", question: "Fråga?" };
  const agent = team.agents[0]!;

  const newState = processAnswerAndResume(agent, team, state, "Svaret är X");

  assert.equal(newState.currentAgentId, "dev-1");
  assert.equal(newState.pendingQuestion, null);
  assert.equal(newState.context.entries.length, 1);
  assert.equal(newState.context.entries[0]?.action, "answer");
});

test("runTeam runs sequential collaboration with mocked provider", async () => {
  const team = createTestTeam();
  const turns: string[] = [];

  let callCount = 0;
  const mockCreateClient = (): ProviderClient => ({
    provider: toSafeProvider(team.agents[0]!.provider),
    chatCompletion: async () => {
      callCount++;
      if (callCount === 1) {
        return {
          id: "1",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "[LÄMNAR ÖVER TILL Erik]\nImplementera funktionen",
              },
              finish_reason: "stop",
            },
          ],
        };
      } else if (callCount === 2) {
        return {
          id: "2",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "[LÄMNAR ÖVER TILL Lisa]\nKod redo för granskning",
              },
              finish_reason: "stop",
            },
          ],
        };
      } else {
        return {
          id: "3",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "[KLART]\nGranskning godkänd",
              },
              finish_reason: "stop",
            },
          ],
        };
      }
    },
  });

  const result = await runTeam(team, "Bygga en enkel funktion", {
    maxTurns: 10,
    createClientFn: mockCreateClient as typeof createClient,
    onTurn: (event) => {
      turns.push(`${event.agentName}: ${event.type}`);
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.turns, 3);
  assert.ok(result.finalSummary.includes("Bygga en enkel funktion"));
  assert.ok(turns.some((t) => t.includes("Anna")));
  assert.ok(turns.some((t) => t.includes("Erik")));
  assert.ok(turns.some((t) => t.includes("Lisa")));
});

test("runTeam handles question and answer flow", async () => {
  const team = createTestTeam();

  let callCount = 0;
  const mockCreateClient = (): ProviderClient => ({
    provider: toSafeProvider(team.agents[0]!.provider),
    chatCompletion: async () => {
      callCount++;
      if (callCount === 1) {
        return {
          id: "1",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "[LÄMNAR ÖVER TILL Erik]\nImplementera",
              },
              finish_reason: "stop",
            },
          ],
        };
      } else if (callCount === 2) {
        return {
          id: "2",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "[FRÅGAR Anna]\nVilken typ ska användas?",
              },
              finish_reason: "stop",
            },
          ],
        };
      } else if (callCount === 3) {
        return {
          id: "3",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "Använd string-typ.",
              },
              finish_reason: "stop",
            },
          ],
        };
      } else {
        return {
          id: "4",
          object: "chat.completion",
          created: Date.now(),
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: "[KLART]\nImplementerat med string",
              },
              finish_reason: "stop",
            },
          ],
        };
      }
    },
  });

  const result = await runTeam(team, "Mål", {
    maxTurns: 10,
    createClientFn: mockCreateClient as typeof createClient,
  });

  assert.equal(result.success, true);
  const entries = result.context.entries;
  assert.ok(entries.some((e) => e.action === "question"));
  assert.ok(entries.some((e) => e.action === "answer"));
});

test("runTeam stops at max turns", async () => {
  const team = createTestTeam();

  let turnNumber = 0;
  const mockCreateClient = (): ProviderClient => ({
    provider: toSafeProvider(team.agents[0]!.provider),
    chatCompletion: async () => {
      turnNumber++;
      const targets = ["Erik", "Lisa", "Anna"];
      const target = targets[(turnNumber - 1) % 3];
      return {
        id: String(turnNumber),
        object: "chat.completion",
        created: Date.now(),
        model: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: `[LÄMNAR ÖVER TILL ${target}]\nMer arbete`,
            },
            finish_reason: "stop",
          },
        ],
      };
    },
  });

  const result = await runTeam(team, "Oändligt mål", {
    maxTurns: 3,
    createClientFn: mockCreateClient as typeof createClient,
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes("maxgräns"));
  assert.equal(result.turns, 3);
});

test("runTeam handles provider error", async () => {
  const team = createTestTeam();

  const mockCreateClient = (): ProviderClient => ({
    provider: toSafeProvider(team.agents[0]!.provider),
    chatCompletion: async () => {
      throw new Error("Provider fel");
    },
  });

  const result = await runTeam(team, "Mål", {
    createClientFn: mockCreateClient as typeof createClient,
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes("misslyckades"));
});

test("formatRunResult formats successful result", () => {
  const result = {
    success: true,
    turns: 5,
    context: createContext("Mål"),
    finalSummary: "Mål: Mål",
  };

  const formatted = formatRunResult(result);

  assert.ok(formatted.includes("✓"));
  assert.ok(formatted.includes("slutförde målet"));
  assert.ok(formatted.includes("5"));
});

test("formatRunResult formats failed result with error", () => {
  const result = {
    success: false,
    turns: 3,
    context: createContext("Mål"),
    finalSummary: "Mål: Mål",
    error: "Något gick fel",
  };

  const formatted = formatRunResult(result);

  assert.ok(formatted.includes("✗"));
  assert.ok(formatted.includes("Något gick fel"));
});

test("team configuration with fake keys never exposes secrets", () => {
  const provider = createMockProvider();
  const team: ConfiguredTeam = {
    name: "Team",
    description: "Test",
    agents: [
      { id: "po-1", roleId: "po", name: "Anna", model: "m", provider },
    ],
  };

  const json = JSON.stringify(team);

  assert.ok(!json.includes("fake-test-key"));
  assert.ok(json.includes("[REDACTED]"));
});

test("example-team.json can be parsed", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  const root = dirname(fileURLToPath(import.meta.url));
  const examplePath = join(root, "..", "example-team.json");
  const content = readFileSync(examplePath, "utf8");
  const input = JSON.parse(content) as TeamConfigInput;

  const config = parseTeamConfig(input);

  assert.equal(config.name, "Exempelteam");
  assert.equal(config.agents.length, 3);
  assert.ok(config.agents.some((a) => a.roleId === "po"));
  assert.ok(config.agents.some((a) => a.roleId === "dev"));
  assert.ok(config.agents.some((a) => a.roleId === "reviewer"));
});
