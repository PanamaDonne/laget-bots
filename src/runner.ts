import {
  estimateMessages,
  estimateTokens,
  resolveMaxTokens,
  tokenCapMessage,
  tokensFromUsage,
} from "./budget.ts";
import type { ChatCompletionRequest, ChatMessage } from "./client.ts";
import { createClient } from "./client.ts";
import type { ContextLimits, ContextSnapshot, SharedContext } from "./context.ts";
import { createContext, createSnapshot, resolveContextLimits } from "./context.ts";
import {
  createQuestionHandoff,
  createWorkHandoff,
  executeHandoff,
  formatHandoffInstructions,
  parseAgentResponse,
  recordAnswer,
  recordDone,
  type ParsedAgentResponse,
} from "./handoff.ts";
import { getRole, type RoleId } from "./roles.ts";
import type { ConfiguredAgent, ConfiguredTeam } from "./team.ts";

export type RunnerOptions = {
  maxTurns?: number;
  /** Total tokens for the run, prompt plus completion. Overrides the team config. */
  maxTokens?: number;
  maxContextEntries?: number;
  maxEntryChars?: number;
  createClientFn?: typeof createClient;
  onTurn?: (event: TurnEvent) => void;
};

export type TurnEvent = {
  turn: number;
  agentId: string;
  agentName: string;
  roleId: RoleId;
  type: "start" | "response" | "handoff" | "question" | "answer" | "done" | "error";
  content: string;
};

export type RunResult = {
  success: boolean;
  turns: number;
  context: SharedContext;
  finalSummary: string;
  error?: string;
  tokensUsed?: number;
};

export type PendingQuestion = {
  fromAgentId: string;
  question: string;
};

export type RunnerState = {
  context: SharedContext;
  currentAgentId: string;
  pendingQuestion: PendingQuestion | null;
  turn: number;
  done: boolean;
  error: string | null;
};

/** Caps turns, not model calls. A question spends a second call on the answer. Cost is capped by maxTokens. */
const DEFAULT_MAX_TURNS = 20;
const runningTeamKeys = new Set<string>();
const TEAM_BUSY = "Teamet körs redan. En agent jobbar i taget.";

function teamRunKey(team: ConfiguredTeam): string {
  const agents = team.agents
    .map((agent) =>
      [agent.id, agent.roleId, agent.name, agent.model, agent.provider.id].join("\u001f"),
    )
    .join("\u001e");
  return [team.name, team.description, agents].join("\u001d");
}

export function createInitialState(
  team: ConfiguredTeam,
  goal: string,
  startAgentId?: string,
  limits?: Partial<ContextLimits>,
): RunnerState {
  const context = createContext(goal, limits);
  const firstAgent = startAgentId
    ? team.agents.find((a) => a.id === startAgentId)
    : team.agents[0];

  if (firstAgent === undefined) {
    throw new Error("Teamet har inga agenter");
  }

  return {
    context,
    currentAgentId: firstAgent.id,
    pendingQuestion: null,
    turn: 0,
    done: false,
    error: null,
  };
}

export function buildAgentPrompt(
  agent: ConfiguredAgent,
  team: ConfiguredTeam,
  snapshot: ContextSnapshot,
  pendingQuestion: PendingQuestion | null,
): ChatMessage[] {
  const role = getRole(agent.roleId);
  const messages: ChatMessage[] = [];

  messages.push({
    role: "system",
    content: `${role.systemPrompt}

${formatHandoffInstructions(team)}

Kontext om det pågående arbetet:
${snapshot.summary}`,
  });

  if (pendingQuestion !== null) {
    const fromAgent = team.agents.find((a) => a.id === pendingQuestion.fromAgentId);
    const fromName = fromAgent?.name ?? pendingQuestion.fromAgentId;
    messages.push({
      role: "user",
      content: `${fromName} frågar dig:\n${pendingQuestion.question}\n\nSvara på frågan. Du kan sen fortsätta ditt arbete eller lämna över till nästa agent.`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Det är din tur att arbeta. Mål: ${snapshot.goal}\n\nUtför ditt arbete och avsluta med att antingen lämna över till nästa agent, ställa en fråga, eller markera att du är klar.`,
    });
  }

  return messages;
}

type PreparedTurn = {
  messages: ChatMessage[];
  maxCompletionTokens: number;
};

export async function executeAgentTurn(
  agent: ConfiguredAgent,
  team: ConfiguredTeam,
  state: RunnerState,
  options: RunnerOptions,
  prepared?: PreparedTurn,
): Promise<{ response: string; usage?: { total_tokens: number }; nextState: RunnerState }> {
  const createClientFn = options.createClientFn ?? createClient;
  const client = createClientFn(agent.provider);
  const messages =
    prepared?.messages ??
    buildAgentPrompt(agent, team, createSnapshot(state.context), state.pendingQuestion);

  const request: ChatCompletionRequest = {
    model: agent.model,
    messages,
    temperature: 0.7,
  };
  if (prepared !== undefined) {
    request.max_tokens = prepared.maxCompletionTokens;
  }

  const result = await client.chatCompletion(request);
  const responseContent = result.choices[0]?.message.content ?? "";

  return {
    response: responseContent,
    usage: result.usage,
    nextState: state,
  };
}

export function processAgentResponse(
  agent: ConfiguredAgent,
  team: ConfiguredTeam,
  state: RunnerState,
  response: string,
): RunnerState {
  const parsed = parseAgentResponse(response, team);

  switch (parsed.type) {
    case "invalid": {
      return {
        ...state,
        turn: state.turn + 1,
        error: parsed.error ?? "Ogiltigt svar",
      };
    }

    case "handoff": {
      if (parsed.targetAgentId === undefined) {
        return {
          ...state,
          turn: state.turn + 1,
          error: "Kunde inte identifiera mottagaren för överlämningen",
        };
      }

      const handoff = createWorkHandoff(agent.id, parsed.targetAgentId, parsed.content);
      const result = executeHandoff(handoff, team, state.context);

      if (!result.accepted) {
        return {
          ...state,
          turn: state.turn + 1,
          error: result.error ?? "Överlämningen misslyckades",
        };
      }

      return {
        ...state,
        currentAgentId: parsed.targetAgentId,
        turn: state.turn + 1,
        pendingQuestion: null,
      };
    }

    case "question": {
      if (parsed.targetAgentId === undefined) {
        return {
          ...state,
          turn: state.turn + 1,
          error: "Kunde inte identifiera mottagaren för frågan",
        };
      }

      const question = createQuestionHandoff(agent.id, parsed.targetAgentId, parsed.content);
      const result = executeHandoff(question, team, state.context);

      if (!result.accepted) {
        return {
          ...state,
          turn: state.turn + 1,
          error: result.error ?? "Frågan kunde inte ställas",
        };
      }

      return {
        ...state,
        currentAgentId: parsed.targetAgentId,
        turn: state.turn + 1,
        pendingQuestion: {
          fromAgentId: agent.id,
          question: parsed.content,
        },
      };
    }

    case "done": {
      recordDone(agent.id, team, state.context, parsed.content);
      return {
        ...state,
        turn: state.turn + 1,
        done: true,
      };
    }

    default: {
      const _exhaustive: never = parsed.type;
      return _exhaustive;
    }
  }
}

export function processAnswerAndResume(
  answeringAgent: ConfiguredAgent,
  team: ConfiguredTeam,
  state: RunnerState,
  answer: string,
): RunnerState {
  if (state.pendingQuestion === null) {
    return state;
  }

  recordAnswer(answeringAgent.id, team, state.context, answer);

  return {
    ...state,
    currentAgentId: state.pendingQuestion.fromAgentId,
    pendingQuestion: null,
  };
}

function turnEventType(type: ParsedAgentResponse["type"]): TurnEvent["type"] {
  switch (type) {
    case "handoff":
    case "question":
    case "done":
      return type;
    case "invalid":
      return "error";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export async function runTeam(
  team: ConfiguredTeam,
  goal: string,
  options: RunnerOptions = {},
): Promise<RunResult> {
  const maxTokens = resolveMaxTokens(options.maxTokens ?? team.maxTokens);
  const contextLimits = resolveContextLimits({
    maxEntries: options.maxContextEntries ?? team.maxContextEntries,
    maxEntryChars: options.maxEntryChars ?? team.maxEntryChars,
  });
  const key = teamRunKey(team);
  if (runningTeamKeys.has(key)) {
    const context = createContext(goal);
    return {
      success: false,
      turns: 0,
      context,
      finalSummary: createSnapshot(context).summary,
      error: TEAM_BUSY,
      tokensUsed: 0,
    };
  }

  runningTeamKeys.add(key);
  try {
    return await runTeamOnce(team, goal, options, maxTokens, contextLimits);
  } finally {
    runningTeamKeys.delete(key);
  }
}

async function runTeamOnce(
  team: ConfiguredTeam,
  goal: string,
  options: RunnerOptions,
  maxTokens: number,
  contextLimits: ContextLimits,
): Promise<RunResult> {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const onTurn = options.onTurn;

  let state = createInitialState(team, goal, undefined, contextLimits);
  let tokensUsed = 0;

  while (!state.done && state.error === null && state.turn < maxTurns) {
    const agent = team.agents.find((a) => a.id === state.currentAgentId);
    if (agent === undefined) {
      state = {
        ...state,
        error: `Okänd agent: ${state.currentAgentId}`,
      };
      break;
    }

    const snapshot = createSnapshot(state.context);
    const messages = buildAgentPrompt(agent, team, snapshot, state.pendingQuestion);
    const promptTokens = estimateMessages(messages);
    if (tokensUsed + promptTokens >= maxTokens) {
      const error = tokenCapMessage(maxTokens, tokensUsed, promptTokens);
      state = { ...state, error };
      if (onTurn !== undefined) {
        onTurn({
          turn: state.turn,
          agentId: agent.id,
          agentName: agent.name,
          roleId: agent.roleId,
          type: "error",
          content: error,
        });
      }
      break;
    }

    if (onTurn !== undefined) {
      onTurn({
        turn: state.turn,
        agentId: agent.id,
        agentName: agent.name,
        roleId: agent.roleId,
        type: "start",
        content: state.pendingQuestion
          ? `Svarar på fråga från ${state.pendingQuestion.fromAgentId}`
          : "Startar arbete",
      });
    }

    let response: string;
    let callUsage: unknown;
    try {
      const result = await executeAgentTurn(agent, team, state, options, {
        messages,
        maxCompletionTokens: maxTokens - tokensUsed - promptTokens,
      });
      response = result.response;
      callUsage = result.usage;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      state = {
        ...state,
        error: `Agent ${agent.name} misslyckades: ${message}`,
      };

      if (onTurn !== undefined) {
        onTurn({
          turn: state.turn,
          agentId: agent.id,
          agentName: agent.name,
          roleId: agent.roleId,
          type: "error",
          content: message,
        });
      }
      break;
    }

    const estimate = promptTokens + estimateTokens(response);
    const reported = tokensFromUsage(callUsage);
    // Prefer the larger figure so a missing or too-low usage report cannot keep spending.
    tokensUsed += reported === null ? estimate : Math.max(reported, estimate);

    if (onTurn !== undefined) {
      onTurn({
        turn: state.turn,
        agentId: agent.id,
        agentName: agent.name,
        roleId: agent.roleId,
        type: "response",
        content: response,
      });
    }

    if (state.pendingQuestion !== null) {
      state = processAnswerAndResume(agent, team, state, response);
      if (onTurn !== undefined) {
        onTurn({
          turn: state.turn,
          agentId: agent.id,
          agentName: agent.name,
          roleId: agent.roleId,
          type: "answer",
          content: response,
        });
      }
    } else {
      state = processAgentResponse(agent, team, state, response);
      const parsed = parseAgentResponse(response, team);

      if (onTurn !== undefined) {
        const failed = state.error !== null;
        onTurn({
          turn: state.turn - 1,
          agentId: agent.id,
          agentName: agent.name,
          roleId: agent.roleId,
          type: failed ? "error" : turnEventType(parsed.type),
          content: failed ? (state.error ?? "") : parsed.content,
        });
      }
    }

    if (state.error === null && tokensUsed > maxTokens) {
      const error = tokenCapMessage(maxTokens, tokensUsed);
      state = { ...state, error };
      if (onTurn !== undefined) {
        onTurn({
          turn: state.turn,
          agentId: agent.id,
          agentName: agent.name,
          roleId: agent.roleId,
          type: "error",
          content: error,
        });
      }
      break;
    }
  }

  if (!state.done && state.error === null && state.turn >= maxTurns) {
    state = {
      ...state,
      error: `Nådde maxgräns på ${maxTurns} omgångar`,
    };
  }

  const snapshot = createSnapshot(state.context);

  return {
    success: state.done && state.error === null,
    turns: state.turn,
    context: state.context,
    finalSummary: snapshot.summary,
    error: state.error ?? undefined,
    tokensUsed,
  };
}

export function formatRunResult(result: RunResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push("✓ Teamet slutförde målet");
  } else if (result.error !== undefined) {
    lines.push(`✗ Teamet avslutade med fel: ${result.error}`);
  } else {
    lines.push("✗ Teamet avslutade utan att slutföra målet");
  }

  lines.push(`Antal omgångar: ${result.turns}`);
  if (result.tokensUsed !== undefined) {
    lines.push(`Använda tokens: ${result.tokensUsed}`);
  }
  lines.push("");
  lines.push(result.finalSummary);

  return lines.join("\n");
}
