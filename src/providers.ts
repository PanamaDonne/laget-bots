export type Region = "SE" | "EU" | "US" | "OTHER";

export type Provider = {
  id: string;
  name: string;
  endpoint: string;
  region: Region;
  isEU: boolean;
  envKey: string;
  defaultModel?: string;
};

export type ConfiguredProvider = Provider & {
  apiKey: string;
};

const KNOWN_PROVIDERS: readonly Provider[] = [
  {
    id: "berget",
    name: "Berget",
    endpoint: "https://api.berget.ai/v1",
    region: "SE",
    isEU: true,
    envKey: "BERGET_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    id: "mistral",
    name: "Mistral",
    endpoint: "https://api.mistral.ai/v1",
    region: "EU",
    isEU: true,
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
  },
  {
    id: "grok",
    name: "Grok (xAI)",
    endpoint: "https://api.x.ai/v1",
    region: "US",
    isEU: false,
    envKey: "XAI_API_KEY",
    defaultModel: "grok-3",
  },
  {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    region: "US",
    isEU: false,
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
  },
] as const;

function compareProviders(a: Provider, b: Provider): number {
  const regionOrder: Record<Region, number> = { SE: 0, EU: 1, US: 2, OTHER: 3 };
  const aOrder = regionOrder[a.region];
  const bOrder = regionOrder[b.region];
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return a.name.localeCompare(b.name);
}

export function listProviders(): readonly Provider[] {
  return [...KNOWN_PROVIDERS].sort(compareProviders);
}

export function getProvider(id: string): Provider | null {
  return KNOWN_PROVIDERS.find((p) => p.id === id) ?? null;
}

export function getProviderByEnvKey(envKey: string): Provider | null {
  return KNOWN_PROVIDERS.find((p) => p.envKey === envKey) ?? null;
}

function readEnvKey(envKey: string): string | null {
  const value = process.env[envKey];
  if (value === undefined || value === "") {
    return null;
  }
  return value;
}

export function configureProvider(id: string): ConfiguredProvider | null {
  const provider = getProvider(id);
  if (provider === null) {
    return null;
  }
  const apiKey = readEnvKey(provider.envKey);
  if (apiKey === null) {
    return null;
  }
  return { ...provider, apiKey };
}

export function listConfiguredProviders(): readonly ConfiguredProvider[] {
  const configured: ConfiguredProvider[] = [];
  for (const provider of KNOWN_PROVIDERS) {
    const apiKey = readEnvKey(provider.envKey);
    if (apiKey !== null) {
      configured.push({ ...provider, apiKey });
    }
  }
  return configured.sort(compareProviders);
}

export function getDefaultProvider(): ConfiguredProvider | null {
  const configured = listConfiguredProviders();
  if (configured.length === 0) {
    return null;
  }
  return configured[0] ?? null;
}

export type CustomProvider = {
  id: string;
  name: string;
  endpoint: string;
  region: Region;
  envKey: string;
  defaultModel?: string;
};

export function createCustomProvider(options: CustomProvider): Provider {
  const isEU = options.region === "SE" || options.region === "EU";
  return {
    id: options.id,
    name: options.name,
    endpoint: options.endpoint,
    region: options.region,
    isEU,
    envKey: options.envKey,
    defaultModel: options.defaultModel,
  };
}

export function configureCustomProvider(options: CustomProvider): ConfiguredProvider | null {
  const provider = createCustomProvider(options);
  const apiKey = readEnvKey(provider.envKey);
  if (apiKey === null) {
    return null;
  }
  return { ...provider, apiKey };
}

export function formatProviderLabel(provider: Provider): string {
  const regionLabel = provider.isEU ? "" : " [non-EU]";
  return `${provider.name}${regionLabel}`;
}

export function formatProviderList(providers: readonly Provider[]): string {
  return providers.map((p) => `- ${formatProviderLabel(p)} (${p.region})`).join("\n");
}
