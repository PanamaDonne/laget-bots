import type { ConfiguredProvider } from "./providers.ts";
import { type RoleId, getRole, isValidRoleId } from "./roles.ts";

export type AgentConfig = {
  id: string;
  roleId: RoleId;
  name: string;
  model?: string;
  providerId?: string;
};

export type TeamConfig = {
  name: string;
  description: string;
  agents: readonly AgentConfig[];
  defaultProviderId?: string;
};

export type TeamConfigInput = {
  namn: string;
  beskrivning: string;
  agenter: readonly AgentConfigInput[];
  standardLeverantör?: string;
};

export type AgentConfigInput = {
  id: string;
  roll: string;
  namn: string;
  modell?: string;
  leverantör?: string;
};

export type ConfiguredAgent = {
  id: string;
  roleId: RoleId;
  name: string;
  model: string;
  provider: ConfiguredProvider;
};

export type ConfiguredTeam = {
  name: string;
  description: string;
  agents: readonly ConfiguredAgent[];
};

function normalizeRoleId(input: string): RoleId {
  const normalized = input.toLowerCase().trim();
  if (isValidRoleId(normalized)) {
    return normalized;
  }
  const mapping: Record<string, RoleId> = {
    "po-agent": "po",
    "produktägare": "po",
    "dev-agent": "dev",
    "utvecklare": "dev",
    "utvecklar-agent": "dev",
    "gransknings-agent": "reviewer",
    "granskare": "reviewer",
    "granskar-agent": "reviewer",
  };
  const mapped = mapping[normalized];
  if (mapped !== undefined) {
    return mapped;
  }
  throw new Error(`Okänd roll: ${input}`);
}

export function parseTeamConfig(input: TeamConfigInput): TeamConfig {
  if (!input.namn || typeof input.namn !== "string") {
    throw new Error("Teamet måste ha ett namn");
  }
  if (!input.beskrivning || typeof input.beskrivning !== "string") {
    throw new Error("Teamet måste ha en beskrivning");
  }
  if (!Array.isArray(input.agenter) || input.agenter.length === 0) {
    throw new Error("Teamet måste ha minst en agent");
  }

  const agents = input.agenter.map((agentInput): AgentConfig => {
    if (!agentInput.id || typeof agentInput.id !== "string") {
      throw new Error("Varje agent måste ha ett id");
    }
    if (!agentInput.roll || typeof agentInput.roll !== "string") {
      throw new Error(`Agent ${agentInput.id} måste ha en roll`);
    }
    if (!agentInput.namn || typeof agentInput.namn !== "string") {
      throw new Error(`Agent ${agentInput.id} måste ha ett namn`);
    }

    const roleId = normalizeRoleId(agentInput.roll);
    getRole(roleId);

    return {
      id: agentInput.id,
      roleId,
      name: agentInput.namn,
      model: agentInput.modell,
      providerId: agentInput.leverantör,
    };
  });

  const agentIds = new Set<string>();
  for (const agent of agents) {
    if (agentIds.has(agent.id)) {
      throw new Error(`Dubblett av agent-id: ${agent.id}`);
    }
    agentIds.add(agent.id);
  }

  return {
    name: input.namn,
    description: input.beskrivning,
    agents,
    defaultProviderId: input.standardLeverantör,
  };
}

export type ResolveProviderFn = (providerId: string | undefined) => ConfiguredProvider | null;

export function configureTeam(
  config: TeamConfig,
  resolveProvider: ResolveProviderFn,
): ConfiguredTeam {
  const configuredAgents: ConfiguredAgent[] = [];

  for (const agentConfig of config.agents) {
    const providerId = agentConfig.providerId ?? config.defaultProviderId;
    const provider = resolveProvider(providerId);
    if (provider === null) {
      throw new Error(
        `Kunde inte konfigurera provider för agent ${agentConfig.id}` +
          (providerId ? ` (provider: ${providerId})` : ""),
      );
    }

    const model = agentConfig.model ?? provider.defaultModel;
    if (model === undefined) {
      throw new Error(
        `Ingen modell angiven för agent ${agentConfig.id} och ingen standardmodell för provider ${provider.id}`,
      );
    }

    configuredAgents.push({
      id: agentConfig.id,
      roleId: agentConfig.roleId,
      name: agentConfig.name,
      model,
      provider,
    });
  }

  return {
    name: config.name,
    description: config.description,
    agents: configuredAgents,
  };
}

export function getAgentById(team: ConfiguredTeam, agentId: string): ConfiguredAgent | null {
  return team.agents.find((a) => a.id === agentId) ?? null;
}

export function getAgentsByRole(team: ConfiguredTeam, roleId: RoleId): readonly ConfiguredAgent[] {
  return team.agents.filter((a) => a.roleId === roleId);
}

export function validateTeamConfig(config: TeamConfig): string[] {
  const errors: string[] = [];

  const hasRole = (roleId: RoleId) => config.agents.some((a) => a.roleId === roleId);

  if (!hasRole("po")) {
    errors.push("Teamet saknar en PO-agent");
  }
  if (!hasRole("dev")) {
    errors.push("Teamet saknar en Dev-agent");
  }
  if (!hasRole("reviewer")) {
    errors.push("Teamet saknar en Gransknings-agent");
  }

  return errors;
}

export function formatTeamSummary(team: ConfiguredTeam): string {
  const lines: string[] = [];
  lines.push(`Team: ${team.name}`);
  lines.push(`Beskrivning: ${team.description}`);
  lines.push("");
  lines.push("Agenter:");
  for (const agent of team.agents) {
    const role = getRole(agent.roleId);
    lines.push(`- ${agent.name} (${role.name}): ${agent.model} via ${agent.provider.name}`);
  }
  return lines.join("\n");
}
