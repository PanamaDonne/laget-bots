import type { ConfiguredAgent, ConfiguredTeam } from "./team.ts";
import type { SharedContext } from "./context.ts";
import { addEntry } from "./context.ts";
import { exactRoleLabels, getRole } from "./roles.ts";

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
      error: selfTargetError(request.type),
    };
  }

  if (request.content.trim() === "") {
    return {
      accepted: false,
      targetAgent: null,
      error: emptyContentError(request.type),
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
  recordAgentEntry(agentId, team, context, "work", workDescription);
}

export function recordDone(
  agentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  summary: string,
): void {
  recordAgentEntry(agentId, team, context, "done", summary);
}

function recordAgentEntry(
  agentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  action: "work" | "done",
  content: string,
): void {
  const agent = team.agents.find((a) => a.id === agentId);
  if (agent === undefined) {
    throw new Error(`Okänd agent: ${agentId}`);
  }
  addEntry(context, agent.id, agent.roleId, action, content);
}

function selfTargetError(type: HandoffType): string {
  switch (type) {
    case "question":
      return "En agent kan inte fråga sig själv";
    case "work":
      return "En agent kan inte lämna över till sig själv";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function emptyContentError(type: HandoffType): string {
  switch (type) {
    case "question":
      return "Frågan måste ha ett innehåll";
    case "work":
      return "Överlämningen måste ha ett innehåll";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export type ParsedAgentResponse = {
  type: "handoff" | "question" | "done" | "invalid";
  content: string;
  targetAgentId?: string;
  error?: string;
};

const MISSING_MARKER =
  "Svaret saknar markör. Använd [LÄMNAR ÖVER TILL …], [FRÅGAR …] eller [KLART].";

const SEVERAL_MARKERS =
  "Svaret har flera markörer. Använd bara en av [LÄMNAR ÖVER TILL …], [FRÅGAR …] eller [KLART].";

type MarkerHit = {
  kind: "handoff" | "question" | "done";
  target: string;
  index: number;
  length: number;
};

export function parseAgentResponse(
  response: string,
  team: ConfiguredTeam,
): ParsedAgentResponse {
  const trimmed = response.trim();
  const hits = findMarkers(trimmed);
  const hit = hits[0];
  if (hit === undefined) {
    return {
      type: "invalid",
      content: trimmed,
      error: MISSING_MARKER,
    };
  }
  if (hits.length > 1) {
    return {
      type: "invalid",
      content: trimmed,
      error: SEVERAL_MARKERS,
    };
  }

  const content = textAroundMarker(trimmed, hit);
  if (hit.kind === "done") {
    return {
      type: "done",
      content,
    };
  }
  return parseAddressed(team, hit.kind, hit.target, content);
}

function findMarkers(text: string): MarkerHit[] {
  const pattern = /\[LÄMNAR ÖVER TILL ([^\]]*)\]|\[FRÅGAR ([^\]]*)\]|\[KLART\]/giu;
  const hits: MarkerHit[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    const kind = markerKind(match);
    hits.push({
      kind,
      target: markerTarget(kind, match),
      index,
      length: match[0].length,
    });
  }
  return hits;
}

function markerKind(match: RegExpMatchArray): MarkerHit["kind"] {
  if (match[1] !== undefined) {
    return "handoff";
  }
  if (match[2] !== undefined) {
    return "question";
  }
  return "done";
}

function markerTarget(kind: MarkerHit["kind"], match: RegExpMatchArray): string {
  switch (kind) {
    case "handoff":
      return match[1] ?? "";
    case "question":
      return match[2] ?? "";
    case "done":
      return "";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function textAroundMarker(text: string, hit: MarkerHit): string {
  const before = text.slice(0, hit.index).trim();
  const after = text.slice(hit.index + hit.length).trim();
  if (before === "") {
    return after;
  }
  if (after === "") {
    return before;
  }
  return `${before}\n${after}`;
}

function parseAddressed(
  team: ConfiguredTeam,
  type: "handoff" | "question",
  rawTarget: string,
  rawContent: string,
): ParsedAgentResponse {
  const content = rawContent.trim();
  const match = matchAgent(team, rawTarget);
  if (!match.ok) {
    return {
      type: "invalid",
      content,
      error: match.error,
    };
  }
  return {
    type,
    content,
    targetAgentId: match.agent.id,
  };
}

type AgentMatch =
  | { ok: true; agent: ConfiguredAgent }
  | { ok: false; error: string };

function matchAgent(team: ConfiguredTeam, reference: string): AgentMatch {
  const trimmed = reference.trim();
  if (trimmed === "") {
    return { ok: false, error: "Mottagaren saknas" };
  }

  const key = trimmed.toLowerCase();
  const hits = team.agents.filter((agent) => agentMatchesReference(agent, key));
  if (hits.length === 0) {
    return { ok: false, error: `Okänd mottagare: ${trimmed}` };
  }
  if (hits.length > 1) {
    return { ok: false, error: `Tvetydig mottagare: ${trimmed}` };
  }

  const agent = hits[0];
  if (agent === undefined) {
    return { ok: false, error: `Okänd mottagare: ${trimmed}` };
  }
  return { ok: true, agent };
}

function agentMatchesReference(agent: ConfiguredAgent, key: string): boolean {
  if (agent.id.toLowerCase() === key || agent.name.toLowerCase() === key) {
    return true;
  }
  return exactRoleLabels(agent.roleId).includes(key);
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

Mottagaren måste matcha id, namn eller roll exakt. En okänd, tom eller tvetydig mottagare är ett fel.

Tillgängliga agenter i teamet:
${agentList}
`.trim();
}
