import type { ConfiguredProvider } from "./providers.ts";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
};

export type ChatCompletionChoice = {
  index: number;
  message: ChatMessage;
  finish_reason: string;
};

export type ChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export const DEFAULT_TIMEOUT_MS = 30_000;

export type ClientOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type ProviderClient = {
  provider: ConfiguredProvider;
  chatCompletion: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
};

const SENSITIVE_PATTERNS = [
  /bearer\s+[^\s"']+/gi,
  /api[_-]?key[^\s"'=]*[=:]\s*["']?[^\s"']+/gi,
  /authorization[^\s"'=]*[=:]\s*["']?[^\s"']+/gi,
  /sk-[a-zA-Z0-9_-]+/g,
  /xai-[a-zA-Z0-9_-]+/g,
];

function sanitizeErrorText(text: string): string {
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + "...[truncated]";
  }
  return sanitized;
}

export function createClient(provider: ConfiguredProvider, options: ClientOptions = {}): ProviderClient {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${provider.endpoint}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Provider ${provider.id} returned ${response.status}: ${sanitizeErrorText(errorText)}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    provider,
    chatCompletion,
  };
}

export function getEndpointUrl(provider: ConfiguredProvider, path: string): string {
  return `${provider.endpoint}${path}`;
}
