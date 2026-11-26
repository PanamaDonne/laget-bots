/** Characters per token when the provider does not report usage. The estimate rounds up. */
const CHARS_PER_TOKEN = 4;

/** Default per-run token cap. A normal dev-flow run is about 70k tokens (SPEC §8). */
export const DEFAULT_MAX_TOKENS = 100_000;

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessages(messages: readonly { content: string }[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateTokens(message.content);
  }
  return total;
}

export function tokensFromUsage(usage: unknown): number | null {
  if (usage == null || typeof usage !== "object" || !("total_tokens" in usage)) {
    return null;
  }
  const total = usage.total_tokens;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    return null;
  }
  return Math.ceil(total);
}

export function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} måste vara ett positivt heltal`);
  }
  return value;
}

export function resolveMaxTokens(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_TOKENS;
  }
  return assertPositiveInteger(value, "Tokentaket");
}

export function tokenCapMessage(maxTokens: number, usedTokens: number, nextTokens?: number): string {
  const unit = maxTokens === 1 ? "token" : "tokens";
  const next = nextTokens !== undefined ? `, nästa anrop cirka ${nextTokens}` : "";
  return `Nådde taket på ${maxTokens} ${unit} (använt ${usedTokens}${next}). Körningen stoppades så att kostnaden inte drar iväg.`;
}
