import type { SafeProvider } from "./providers.ts";

export type AgentEntry = {
  agentId: string;
  roleId: string;
  timestamp: Date;
  action: "work" | "handoff" | "question" | "answer" | "done";
  content: string;
};

export type SharedContext = {
  goal: string;
  entries: AgentEntry[];
};

export function createContext(goal: string): SharedContext {
  return {
    goal,
    entries: [],
  };
}

export function addEntry(
  context: SharedContext,
  agentId: string,
  roleId: string,
  action: AgentEntry["action"],
  content: string,
): void {
  context.entries.push({
    agentId,
    roleId,
    timestamp: new Date(),
    action,
    content,
  });
}

export function getLatestEntries(context: SharedContext, count: number): readonly AgentEntry[] {
  return context.entries.slice(-count);
}

export function summarizeContext(context: SharedContext): string {
  const lines: string[] = [];
  lines.push(`Mål: ${context.goal}`);
  lines.push("");

  if (context.entries.length === 0) {
    lines.push("Ingen aktivitet ännu.");
    return lines.join("\n");
  }

  lines.push("Aktivitet:");
  for (const entry of context.entries) {
    const actionLabel = formatActionLabel(entry.action);
    lines.push(`- [${entry.roleId}] ${actionLabel}: ${entry.content}`);
  }

  return lines.join("\n");
}

function formatActionLabel(action: AgentEntry["action"]): string {
  switch (action) {
    case "work":
      return "Arbete";
    case "handoff":
      return "Lämnar över";
    case "question":
      return "Frågar";
    case "answer":
      return "Svarar";
    case "done":
      return "Klar";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export type ContextSnapshot = {
  goal: string;
  summary: string;
  recentEntries: readonly AgentEntry[];
  provider?: SafeProvider;
};

export function createSnapshot(
  context: SharedContext,
  recentCount: number = 10,
  provider?: SafeProvider,
): ContextSnapshot {
  return {
    goal: context.goal,
    summary: summarizeContext(context),
    recentEntries: getLatestEntries(context, recentCount),
    provider,
  };
}
