import { CAP_ORE, charge, costOre, type Ledger } from "./cost.ts";
import { scrubError } from "./secrets.ts";
import { SV } from "./swedish.ts";

export const CHAT_TIMEOUT_MS = 15_000;

export type ChatInput = {
  liveChoice: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  providerId: string;
  userText: string;
  tokenCap: number;
  usedTokens: number;
  orePerMillion: number | null;
  ledger: Ledger;
  now: Date;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  onLedger?: (ledger: Ledger) => void;
};

export type ChatResult = {
  calledModel: boolean;
  text: string;
  ledger: Ledger;
  usedTokens: number;
};

const SYSTEM_PROMPT = "Du är Radio Days och svarar kort på svenska. Du har inga verktyg.";

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function completeChat(input: ChatInput): Promise<ChatResult> {
  const idle = {
    calledModel: false,
    ledger: input.ledger,
    usedTokens: input.usedTokens,
  };
  if (!input.liveChoice || input.apiKey.trim().length === 0) {
    return { ...idle, text: SV.liveOff };
  }
  if (input.orePerMillion === null) {
    return { ...idle, text: SV.priceMissing };
  }
  if (input.model.trim().length === 0 || !input.baseUrl.startsWith("https://")) {
    return { ...idle, text: SV.modelMissing };
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: input.userText },
  ];
  const promptTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  if (input.usedTokens + promptTokens > input.tokenCap) {
    return { ...idle, text: SV.tokenCap };
  }

  const remaining = input.tokenCap - input.usedTokens - promptTokens;
  const reserve = Math.max(1, Math.min(300, remaining));
  const opening = { month: input.ledger.month, spentOre: input.ledger.spentOre };
  const estimated = charge(opening, costOre(promptTokens + reserve, input.orePerMillion), input.now);
  if (!estimated.allowed) {
    return { ...idle, text: SV.paused, ledger: estimated.ledger };
  }
  input.onLedger?.(estimated.ledger);

  let response: Response;
  try {
    const base = input.baseUrl.replace(/\/$/, "");
    response = await input.fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages,
        max_tokens: reserve,
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (error) {
    throw scrubError(error, [input.apiKey], SV.failed);
  }

  if (!response.ok) {
    await response.text().catch(() => "");
    const statusLine = `Provider ${input.providerId} returned HTTP ${response.status}`;
    throw scrubError(new Error(statusLine), [input.apiKey], statusLine);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw scrubError(error, [input.apiKey], SV.failed);
  }

  const text = readContent(payload);
  const tokens = readTotalTokens(payload) ?? promptTokens + reserve;
  const billed = charge(opening, costOre(tokens, input.orePerMillion), input.now);
  const ledger = billed.allowed ? billed.ledger : { month: estimated.ledger.month, spentOre: CAP_ORE };
  input.onLedger?.(ledger);
  const notice = billed.notice;
  return {
    calledModel: true,
    text: notice === null ? text : `${text} ${notice}`,
    ledger,
    usedTokens: input.usedTokens + tokens,
  };
}

function readContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("choices" in payload)) {
    throw new Error(SV.failed);
  }
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(SV.failed);
  }
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) {
    throw new Error(SV.failed);
  }
  const message = first.message;
  if (typeof message !== "object" || message === null || !("content" in message)) {
    throw new Error(SV.failed);
  }
  if (typeof message.content !== "string" || message.content.trim().length === 0) {
    throw new Error(SV.failed);
  }
  return message.content.trim();
}

function readTotalTokens(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null || !("usage" in payload)) return null;
  const usage = payload.usage;
  if (typeof usage !== "object" || usage === null || !("total_tokens" in usage)) return null;
  return typeof usage.total_tokens === "number" ? usage.total_tokens : null;
}
