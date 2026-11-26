import { readFileSync } from "node:fs";

import type { ChatCompletionResponse, ProviderClient } from "./client.ts";
import { createClient } from "./client.ts";
import { ConfiguredProvider, configureProvider, createCustomProvider, formatProviderLabel, getProvider } from "./providers.ts";
import { getRole } from "./roles.ts";
import { formatRunResult, runTeam, type RunResult, type TurnEvent } from "./runner.ts";
import {
  configureTeam,
  parseTeamConfig,
  type AgentConfig,
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
  maxTokens?: number;
  providerId?: string;
  model?: string;
};

type ResolvedRun = {
  team: ConfiguredTeam;
  live: boolean;
  notice: string;
};

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value;
}

function applySelection(
  config: TeamConfig,
  selection: { providerId?: string; model?: string },
): TeamConfig {
  const providerId = blankToUndefined(selection.providerId);
  const model = blankToUndefined(selection.model);
  return {
    ...config,
    defaultProviderId: providerId ?? blankToUndefined(config.defaultProviderId),
    agents: config.agents.map((agent) => ({
      ...agent,
      providerId: providerId ?? blankToUndefined(agent.providerId),
      model: model ?? agent.model,
    })),
  };
}

function chosenProviderId(agent: AgentConfig, config: TeamConfig): string | undefined {
  return agent.providerId ?? config.defaultProviderId;
}

/** Live only when every agent has a configured provider. Any missing key keeps the whole run on the mock. */
function resolveRun(config: TeamConfig): ResolvedRun {
  const ids = config.agents.map((agent) => chosenProviderId(agent, config));
  const missingEnv: string[] = [];
  const configured = new Map<string, ConfiguredProvider>();

  for (const id of ids) {
    if (id === undefined) {
      continue;
    }
    const known = getProvider(id);
    if (known === null) {
      throw new Error(`Okänd leverantör: ${id}`);
    }
    if (configured.has(id) || missingEnv.includes(known.envKey)) {
      continue;
    }
    const ready = configureProvider(id);
    if (ready === null) {
      missingEnv.push(known.envKey);
    } else {
      configured.set(id, ready);
    }
  }

  const live = ids.every((id) => id !== undefined && configured.has(id));
  if (!live) {
    return {
      team: configureTeam(config, () => createDemoProvider()),
      live: false,
      notice: missingEnv.length === 0 ? "Leverantör: Mock" : `Leverantör: Mock (ingen nyckel i ${missingEnv.join(", ")})`,
    };
  }

  const team = configureTeam(config, (providerId) => {
    if (providerId === undefined) {
      return null;
    }
    return configured.get(providerId) ?? null;
  });
  return { team, live: true, notice: formatLiveNotice(team) };
}

function formatLiveNotice(team: ConfiguredTeam): string {
  const labels = team.agents.map((agent) => ({
    name: agent.name,
    provider: formatProviderLabel(agent.provider),
    model: agent.model,
  }));
  const first = labels[0];
  if (
    first !== undefined &&
    labels.every((label) => label.provider === first.provider && label.model === first.model)
  ) {
    return `Leverantör: ${first.provider}, modell ${first.model}`;
  }
  const lines = ["Leverantörer:"];
  for (const label of labels) {
    lines.push(`- ${label.name}: ${label.provider}, modell ${label.model}`);
  }
  return lines.join("\n");
}

function redactSecrets(text: string, secrets: readonly string[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

function uniqueSecrets(team: ConfiguredTeam): string[] {
  const secrets: string[] = [];
  for (const agent of team.agents) {
    const secret = agent.provider.getApiKey();
    if (secret.length > 0 && !secrets.includes(secret)) {
      secrets.push(secret);
    }
  }
  return secrets;
}

function redactResult(result: RunResult, secrets: readonly string[]): RunResult {
  if (secrets.length === 0) {
    return result;
  }
  const redact = (text: string) => redactSecrets(text, secrets);
  return {
    ...result,
    error: result.error === undefined ? undefined : redact(result.error),
    finalSummary: redact(result.finalSummary),
    context: {
      ...result.context,
      goal: redact(result.context.goal),
      entries: result.context.entries.map((entry) => ({
        ...entry,
        content: redact(entry.content),
      })),
    },
  };
}

export async function runTeamFromFile(
  configPath: string,
  goal: string,
  io: TeamRunIO = {},
): Promise<Awaited<ReturnType<typeof runTeam>>> {
  const emit = io.write ?? ((line: string) => console.log(line));
  const config = loadTeamConfig(configPath);
  const resolved = resolveRun(applySelection(config, { providerId: io.providerId, model: io.model }));
  const secrets = resolved.live ? uniqueSecrets(resolved.team) : [];
  const write = (line: string) => emit(redactSecrets(line, secrets));

  write(`Teamkörning: ${resolved.team.name}`);
  write(`Mål: ${goal}`);
  for (const line of resolved.notice.split("\n")) {
    write(line);
  }
  write("");

  const result = await runTeam(resolved.team, goal, {
    maxTokens: io.maxTokens,
    createClientFn: resolved.live ? createClient : createDemoClient(resolved.team),
    onTurn: (event) => {
      const line = formatDemoTurn(event);
      if (line !== null) {
        write(line);
      }
    },
  });

  write("");
  write(formatRunResult(result));
  return redactResult(result, secrets);
}
