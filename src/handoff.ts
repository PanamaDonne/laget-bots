import type { ConfiguredAgent, ConfiguredTeam } from "./team.ts";
import type { SharedContext } from "./context.ts";
import { addEntry } from "./context.ts";
import { getRole } from "./roles.ts";

export type HandoffType = "work" | "question";

export type HandoffRequest = {
  type: HandoffType;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  requiresResponse: boolean;
};

export type HandoffResult = {
  accepted: boolean;
  targetAgent: ConfiguredAgent | null;
  error?: string;
};

export function createWorkHandoff(
  fromAgentId: string,
  toAgentId: string,
  content: string,
): HandoffRequest {
  return {
    type: "work",
    fromAgentId,
    toAgentId,
    content,
    requiresResponse: false,
  };
}

export function createQuestionHandoff(
  fromAgentId: string,
  toAgentId: string,
  question: string,
): HandoffRequest {
  return {
    type: "question",
    fromAgentId,
    toAgentId,
    content: question,
    requiresResponse: true,
  };
}

export function validateHandoff(
  request: HandoffRequest,
  team: ConfiguredTeam,
): HandoffResult {
  const fromAgent = team.agents.find((a) => a.id === request.fromAgentId);
  if (fromAgent === undefined) {
    return {
      accepted: false,
      targetAgent: null,
      error: `Okänd avsändare: ${request.fromAgentId}`,
    };
  }

  const toAgent = team.agents.find((a) => a.id === request.toAgentId);
  if (toAgent === undefined) {
    return {
      accepted: false,
      targetAgent: null,
      error: `Okänd mottagare: ${request.toAgentId}`,
    };
  }

  if (request.fromAgentId === request.toAgentId) {
    return {
      accepted: false,
      targetAgent: null,
      error: "En agent kan inte lämna över till sig själv",
    };
  }

  if (request.content.trim() === "") {
    return {
      accepted: false,
      targetAgent: null,
      error: "Överlämningen måste ha ett innehåll",
    };
  }

  return {
    accepted: true,
    targetAgent: toAgent,
  };
}

export function executeHandoff(
  request: HandoffRequest,
  team: ConfiguredTeam,
  context: SharedContext,
): HandoffResult {
  const validation = validateHandoff(request, team);
  if (!validation.accepted) {
    return validation;
  }

  const fromAgent = team.agents.find((a) => a.id === request.fromAgentId);
  if (fromAgent === undefined) {
    return {
      accepted: false,
      targetAgent: null,
      error: `Okänd avsändare: ${request.fromAgentId}`,
    };
  }

  const action = request.type === "question" ? "question" : "handoff";
  addEntry(context, fromAgent.id, fromAgent.roleId, action, request.content);

  return validation;
}

export function recordAnswer(
  fromAgentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  answer: string,
): void {
  const fromAgent = team.agents.find((a) => a.id === fromAgentId);
  if (fromAgent === undefined) {
    throw new Error(`Okänd agent: ${fromAgentId}`);
  }
  addEntry(context, fromAgent.id, fromAgent.roleId, "answer", answer);
}

export function recordWork(
  agentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  workDescription: string,
): void {
  const agent = team.agents.find((a) => a.id === agentId);
  if (agent === undefined) {
    throw new Error(`Okänd agent: ${agentId}`);
  }
  addEntry(context, agent.id, agent.roleId, "work", workDescription);
}

export type ParsedAgentResponse = {
  type: "work" | "handoff" | "question" | "done";
  content: string;
  targetAgentId?: string;
};

export function parseAgentResponse(
  response: string,
  team: ConfiguredTeam,
): ParsedAgentResponse {
  const trimmed = response.trim();

  const handoffMatch = trimmed.match(
    /^\[LÄMNAR ÖVER TILL ([^\]]+)\]\s*(.*)$/s,
  );
  if (handoffMatch) {
    const targetName = handoffMatch[1]?.trim() ?? "";
    const content = handoffMatch[2]?.trim() ?? "";
    const targetAgent = findAgentByReference(team, targetName);
    if (targetAgent !== null) {
      return {
        type: "handoff",
        content,
        targetAgentId: targetAgent.id,
      };
    }
  }

  const questionMatch = trimmed.match(
    /^\[FRÅGAR ([^\]]+)\]\s*(.*)$/s,
  );
  if (questionMatch) {
    const targetName = questionMatch[1]?.trim() ?? "";
    const content = questionMatch[2]?.trim() ?? "";
    const targetAgent = findAgentByReference(team, targetName);
    if (targetAgent !== null) {
      return {
        type: "question",
        content,
        targetAgentId: targetAgent.id,
      };
    }
  }

  const doneMatch = trimmed.match(/^\[KLART\]\s*(.*)$/s);
  if (doneMatch) {
    return {
      type: "done",
      content: doneMatch[1]?.trim() ?? "",
    };
  }

  return {
    type: "work",
    content: trimmed,
  };
}

function findAgentByReference(
  team: ConfiguredTeam,
  reference: string,
): ConfiguredAgent | null {
  const normalized = reference.toLowerCase().trim();

  const byId = team.agents.find((a) => a.id.toLowerCase() === normalized);
  if (byId !== undefined) {
    return byId;
  }

  const byName = team.agents.find((a) => a.name.toLowerCase() === normalized);
  if (byName !== undefined) {
    return byName;
  }

  const byRole = team.agents.find((a) => {
    const role = getRole(a.roleId);
    return (
      role.id === normalized ||
      role.name.toLowerCase() === normalized ||
      role.name.toLowerCase().includes(normalized)
    );
  });
  if (byRole !== undefined) {
    return byRole;
  }

  return null;
}

export function formatHandoffInstructions(team: ConfiguredTeam): string {
  const agentList = team.agents
    .map((a) => {
      const role = getRole(a.roleId);
      return `  - ${a.name} (${role.name})`;
    })
    .join("\n");

  return `
När du vill lämna över arbete till en annan agent, använd formatet:
[LÄMNAR ÖVER TILL <agentnamn>]
<beskrivning av vad som ska göras>

När du vill ställa en fråga till en annan agent, använd formatet:
[FRÅGAR <agentnamn>]
<din fråga>

När du är klar med ditt arbete och det inte behöver lämnas vidare, använd formatet:
[KLART]
<sammanfattning av vad du har gjort>

Tillgängliga agenter i teamet:
${agentList}
`.trim();
}
