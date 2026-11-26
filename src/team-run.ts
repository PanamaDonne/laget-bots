import { readFileSync } from "node:fs";

import type { ChatCompletionResponse, ProviderClient } from "./client.ts";
import { createClient } from "./client.ts";
import { ConfiguredProvider, createCustomProvider } from "./providers.ts";
import { getRole } from "./roles.ts";
import { formatRunResult, runTeam, type TurnEvent } from "./runner.ts";
import {
  configureTeam,
  parseTeamConfig,
  type ConfiguredTeam,
  type TeamConfig,
  type TeamConfigInput,
} from "./team.ts";

const DEMO_KEY = "fake-team-demo-key";

export function createDemoProvider(): ConfiguredProvider {
  const provider = createCustomProvider({
    id: "mock",
    name: "Mock",
    endpoint: "http://127.0.0.1/mock",
    region: "SE",
    envKey: "FAKE_TEAM_DEMO_KEY",
    defaultModel: "mock-demo",
  });
  return new ConfiguredProvider(provider, DEMO_KEY);
}

export function loadTeamConfig(path: string): TeamConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Kunde inte läsa teamfilen: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Teamfilen är inte giltig JSON: ${path}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Teamfilen har fel format");
  }

  return parseTeamConfig(parsed as TeamConfigInput);
}

export function formatDemoTurn(event: TurnEvent): string | null {
  const role = getRole(event.roleId);
  const who = `${event.agentName} (${role.name})`;
  switch (event.type) {
    case "handoff":
      return `${who} lämnar över: ${event.content}`;
    case "question":
      return `${who} frågar: ${event.content}`;
    case "answer":
      return `${who} svarar: ${event.content}`;
    case "done":
      return `${who} klar: ${event.content}`;
    case "error":
      return `${who} fel: ${event.content}`;
    case "start":
    case "response":
      return null;
    default: {
      const _exhaustive: never = event.type;
      return _exhaustive;
    }
  }
}

export function createDemoClient(team: ConfiguredTeam): typeof createClient {
  let devHasAsked = false;

  return (): ProviderClient => ({
    provider: {
      id: "mock",
      name: "Mock",
      endpoint: "http://127.0.0.1/mock",
      region: "SE",
      isEU: true,
      envKey: "FAKE_TEAM_DEMO_KEY",
      defaultModel: "mock-demo",
      hasApiKey: true,
    },
    chatCompletion: async (request): Promise<ChatCompletionResponse> => {
      const system = request.messages.find((message) => message.role === "system")?.content ?? "";
      const user = request.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
      const content = demoReply(team, system, user, devHasAsked);
      if (speakingRole(system) === "dev" && !user.includes("frågar dig")) {
        devHasAsked = true;
      }
      return {
        id: "demo",
        object: "chat.completion",
        created: 0,
        model: "mock-demo",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
      };
    },
  });
}

function demoReply(
  team: ConfiguredTeam,
  system: string,
  user: string,
  devHasAsked: boolean,
): string {
  if (user.includes("frågar dig")) {
    return "Använd vanlig text.";
  }

  const po = nameForRole(team, "po");
  const dev = nameForRole(team, "dev");
  const reviewer = nameForRole(team, "reviewer");
  const role = speakingRole(system);
  switch (role) {
    case "po":
      return `[LÄMNAR ÖVER TILL ${dev}]\nImplementera målet`;
    case "dev":
      if (!devHasAsked) {
        return `[FRÅGAR ${po}]\nVilket format ska resultatet ha?`;
      }
      return `[LÄMNAR ÖVER TILL ${reviewer}]\nImplementationen är klar för granskning`;
    case "reviewer":
      return "[KLART]\nGranskningen är godkänd";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function speakingRole(system: string): "po" | "dev" | "reviewer" {
  const markers: Array<["po" | "dev" | "reviewer", number]> = [
    ["po", system.indexOf("produktägar-agent")],
    ["dev", system.indexOf("utvecklar-agent")],
    ["reviewer", system.indexOf("gransknings-agent")],
  ];
  const found = markers.filter((entry) => entry[1] >= 0).sort((left, right) => left[1] - right[1]);
  const role = found[0]?.[0];
  if (role === undefined) {
    throw new Error("Kunde inte avgöra rollen i demon");
  }
  return role;
}

function nameForRole(team: ConfiguredTeam, roleId: "po" | "dev" | "reviewer"): string {
  const agent = team.agents.find((candidate) => candidate.roleId === roleId);
  if (agent === undefined) {
    throw new Error(`Teamet saknar rollen ${roleId}`);
  }
  return agent.name;
}

export type TeamRunIO = {
  write?: (line: string) => void;
};

export async function runTeamFromFile(
  configPath: string,
  goal: string,
  io: TeamRunIO = {},
): Promise<Awaited<ReturnType<typeof runTeam>>> {
  const write = io.write ?? ((line: string) => console.log(line));
  const config = loadTeamConfig(configPath);
  const team = configureTeam(config, () => createDemoProvider());

  write(`Teamkörning: ${team.name}`);
  write(`Mål: ${goal}`);
  write("");

  const result = await runTeam(team, goal, {
    createClientFn: createDemoClient(team),
    onTurn: (event) => {
      const line = formatDemoTurn(event);
      if (line !== null) {
        write(line);
      }
    },
  });

  write("");
  write(formatRunResult(result));
  return result;
}
