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

export type ClientOptions = {
  fetch?: typeof globalThis.fetch;
};

export type ProviderClient = {
  provider: ConfiguredProvider;
  chatCompletion: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
};

export function createClient(provider: ConfiguredProvider, options: ClientOptions = {}): ProviderClient {
  const fetchFn = options.fetch ?? globalThis.fetch;

  async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${provider.endpoint}/chat/completions`;
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Provider ${provider.id} returned ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data;
  }

  return {
    provider,
    chatCompletion,
  };
}

export function getEndpointUrl(provider: ConfiguredProvider, path: string): string {
  return `${provider.endpoint}${path}`;
}
