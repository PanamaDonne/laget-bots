import { assertPositiveInteger } from "./budget.ts";
import type { SafeProvider } from "./providers.ts";

export type AgentEntry = {
  agentId: string;
  roleId: string;
  timestamp: Date;
  action: "work" | "handoff" | "question" | "answer" | "done";
  content: string;
};

/** Recent entries kept verbatim. Older ones are dropped so a long run stays the same size. */
export const DEFAULT_MAX_CONTEXT_ENTRIES = 12;

/** Characters kept from each entry, including the truncation mark. */
export const DEFAULT_MAX_ENTRY_CHARS = 2_000;

const TRUNCATION_MARK = "… (avkortat)";

export type ContextLimits = {
  maxEntries: number;
  maxEntryChars: number;
};

export type SharedContext = {
  goal: string;
  entries: AgentEntry[];
  limits: ContextLimits;
  omittedCount: number;
};

export function resolveContextLimits(partial?: Partial<ContextLimits>): ContextLimits {
  return {
    maxEntries:
      partial?.maxEntries === undefined
        ? DEFAULT_MAX_CONTEXT_ENTRIES
        : assertPositiveInteger(partial.maxEntries, "Antal poster"),
    maxEntryChars:
      partial?.maxEntryChars === undefined
        ? DEFAULT_MAX_ENTRY_CHARS
        : assertPositiveInteger(partial.maxEntryChars, "Tecken per post"),
  };
}

export function createContext(goal: string, limits?: Partial<ContextLimits>): SharedContext {
  return {
    goal,
    entries: [],
    limits: resolveContextLimits(limits),
    omittedCount: 0,
  };
}

export function boundEntryContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  if (maxChars <= TRUNCATION_MARK.length) {
    return content.slice(0, maxChars);
  }
  return content.slice(0, maxChars - TRUNCATION_MARK.length) + TRUNCATION_MARK;
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
    content: boundEntryContent(content, context.limits.maxEntryChars),
  });

  while (context.entries.length > context.limits.maxEntries) {
    if (context.entries.shift() === undefined) {
      break;
    }
    context.omittedCount += 1;
  }
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

  if (context.omittedCount > 0) {
    const dropped = context.omittedCount === 1 ? "utelämnad" : "utelämnade";
    lines.push(
      `Tidigare poster: ${context.omittedCount} ${dropped} för att hålla kontexten inom taket.`,
    );
    lines.push("");
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
