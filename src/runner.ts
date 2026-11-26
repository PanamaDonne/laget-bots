import type { ChatMessage } from "./client.ts";
import { createClient } from "./client.ts";
import type { SharedContext, ContextSnapshot } from "./context.ts";
import { createContext, createSnapshot } from "./context.ts";
import {
  createQuestionHandoff,
  createWorkHandoff,
  executeHandoff,
  formatHandoffInstructions,
  parseAgentResponse,
  recordAnswer,
  recordWork,
  type ParsedAgentResponse,
} from "./handoff.ts";
import { getRole, type RoleId } from "./roles.ts";
import type { ConfiguredAgent, ConfiguredTeam } from "./team.ts";

export type RunnerOptions = {
  maxTurns?: number;
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

const DEFAULT_MAX_TURNS = 20;
const runningTeams = new WeakSet<ConfiguredTeam>();
const TEAM_BUSY = "Teamet körs redan. En agent jobbar i taget.";

export function createInitialState(
  team: ConfiguredTeam,
  goal: string,
  startAgentId?: string,
): RunnerState {
  const context = createContext(goal);
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

export async function executeAgentTurn(
  agent: ConfiguredAgent,
  team: ConfiguredTeam,
  state: RunnerState,
  options: RunnerOptions,
): Promise<{ response: string; nextState: RunnerState }> {
  const createClientFn = options.createClientFn ?? createClient;
  const client = createClientFn(agent.provider);

  const snapshot = createSnapshot(state.context);
  const messages = buildAgentPrompt(agent, team, snapshot, state.pendingQuestion);

  const result = await client.chatCompletion({
    model: agent.model,
    messages,
    temperature: 0.7,
  });

  const responseContent = result.choices[0]?.message.content ?? "";

  return {
    response: responseContent,
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
      recordWork(agent.id, team, state.context, parsed.content);
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
  if (runningTeams.has(team)) {
    const context = createContext(goal);
    return {
      success: false,
      turns: 0,
      context,
      finalSummary: createSnapshot(context).summary,
      error: TEAM_BUSY,
    };
  }

  runningTeams.add(team);
  try {
    return await runTeamOnce(team, goal, options);
  } finally {
    runningTeams.delete(team);
  }
}

async function runTeamOnce(
  team: ConfiguredTeam,
  goal: string,
  options: RunnerOptions,
): Promise<RunResult> {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const onTurn = options.onTurn;

  let state = createInitialState(team, goal);

  while (!state.done && state.error === null && state.turn < maxTurns) {
    const agent = team.agents.find((a) => a.id === state.currentAgentId);
    if (agent === undefined) {
      state = {
        ...state,
        error: `Okänd agent: ${state.currentAgentId}`,
      };
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
    try {
      const result = await executeAgentTurn(agent, team, state, options);
      response = result.response;
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
        onTurn({
          turn: state.turn - 1,
          agentId: agent.id,
          agentName: agent.name,
          roleId: agent.roleId,
          type: turnEventType(parsed.type),
          content: parsed.type === "invalid" ? (parsed.error ?? parsed.content) : parsed.content,
        });
      }
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
  lines.push("");
  lines.push(result.finalSummary);

  return lines.join("\n");
}
