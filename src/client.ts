import { type ConfiguredProvider, type SafeProvider, toSafeProvider } from "./providers.ts";

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
  provider: SafeProvider;
  chatCompletion: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
};

export function createClient(provider: ConfiguredProvider, options: ClientOptions = {}): ProviderClient {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const safeProvider = toSafeProvider(provider);

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
        throw new Error(`Provider ${provider.id} returned ${response.status}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    provider: safeProvider,
    chatCompletion,
  };
}

export function getEndpointUrl(provider: ConfiguredProvider, path: string): string {
  return `${provider.endpoint}${path}`;
}
