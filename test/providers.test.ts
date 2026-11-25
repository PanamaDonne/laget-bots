import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";

import {
  configureCustomProvider,
  configureProvider,
  createCustomProvider,
  formatProviderLabel,
  formatProviderList,
  getDefaultProvider,
  getProvider,
  getProviderByEnvKey,
  listConfiguredProviders,
  listProviders,
  toSafeProvider,
  toSafeProviders,
} from "../src/providers.ts";
import { createClient, getEndpointUrl } from "../src/client.ts";

test("listProviders returns providers sorted by region (SE first, then EU, then US)", () => {
  const providers = listProviders();

  assert.ok(providers.length >= 4);
  const ids = providers.map((p) => p.id);
  assert.equal(ids[0], "berget");
  assert.equal(ids[1], "mistral");
  assert.ok(ids.indexOf("grok") > ids.indexOf("mistral"));
  assert.ok(ids.indexOf("openai") > ids.indexOf("mistral"));
});

test("listProviders includes Berget as Swedish EU provider", () => {
  const providers = listProviders();
  const berget = providers.find((p) => p.id === "berget");

  assert.ok(berget);
  assert.equal(berget.name, "Berget");
  assert.equal(berget.region, "SE");
  assert.equal(berget.isEU, true);
  assert.equal(berget.endpoint, "https://api.berget.ai/v1");
  assert.equal(berget.envKey, "BERGET_API_KEY");
});

test("listProviders includes Mistral as EU provider", () => {
  const providers = listProviders();
  const mistral = providers.find((p) => p.id === "mistral");

  assert.ok(mistral);
  assert.equal(mistral.name, "Mistral");
  assert.equal(mistral.region, "EU");
  assert.equal(mistral.isEU, true);
  assert.equal(mistral.endpoint, "https://api.mistral.ai/v1");
  assert.equal(mistral.envKey, "MISTRAL_API_KEY");
});

test("listProviders includes Grok as non-EU provider", () => {
  const providers = listProviders();
  const grok = providers.find((p) => p.id === "grok");

  assert.ok(grok);
  assert.equal(grok.name, "Grok (xAI)");
  assert.equal(grok.region, "US");
  assert.equal(grok.isEU, false);
  assert.equal(grok.endpoint, "https://api.x.ai/v1");
  assert.equal(grok.envKey, "XAI_API_KEY");
});

test("getProvider returns provider by id", () => {
  const berget = getProvider("berget");
  const mistral = getProvider("mistral");
  const grok = getProvider("grok");

  assert.ok(berget);
  assert.equal(berget.id, "berget");
  assert.ok(mistral);
  assert.equal(mistral.id, "mistral");
  assert.ok(grok);
  assert.equal(grok.id, "grok");
});

test("getProvider returns null for unknown provider", () => {
  const unknown = getProvider("unknown-provider");

  assert.equal(unknown, null);
});

test("getProviderByEnvKey returns provider by environment variable name", () => {
  const berget = getProviderByEnvKey("BERGET_API_KEY");
  const mistral = getProviderByEnvKey("MISTRAL_API_KEY");
  const grok = getProviderByEnvKey("XAI_API_KEY");

  assert.ok(berget);
  assert.equal(berget.id, "berget");
  assert.ok(mistral);
  assert.equal(mistral.id, "mistral");
  assert.ok(grok);
  assert.equal(grok.id, "grok");
});

test("configureProvider returns null when API key is not set", () => {
  const original = process.env.BERGET_API_KEY;
  delete process.env.BERGET_API_KEY;

  const configured = configureProvider("berget");

  assert.equal(configured, null);
  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  }
});

test("configureProvider returns configured provider when API key is set", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-key-12345";

  const configured = configureProvider("berget");

  assert.ok(configured);
  assert.equal(configured.id, "berget");
  assert.equal(configured.getApiKey(), "test-key-12345");
  assert.equal(configured.endpoint, "https://api.berget.ai/v1");

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("configureProvider returns null for unknown provider", () => {
  const configured = configureProvider("unknown-provider");

  assert.equal(configured, null);
});

test("listConfiguredProviders returns only providers with API keys set", () => {
  const originalBerget = process.env.BERGET_API_KEY;
  const originalMistral = process.env.MISTRAL_API_KEY;
  const originalGrok = process.env.XAI_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.BERGET_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.MISTRAL_API_KEY = "mistral-test-key";
  process.env.XAI_API_KEY = "grok-test-key";

  const configured = listConfiguredProviders();

  assert.equal(configured.length, 2);
  assert.equal(configured[0]?.id, "mistral");
  assert.equal(configured[1]?.id, "grok");

  if (originalBerget !== undefined) process.env.BERGET_API_KEY = originalBerget;
  else delete process.env.BERGET_API_KEY;
  if (originalMistral !== undefined) process.env.MISTRAL_API_KEY = originalMistral;
  else delete process.env.MISTRAL_API_KEY;
  if (originalGrok !== undefined) process.env.XAI_API_KEY = originalGrok;
  else delete process.env.XAI_API_KEY;
  if (originalOpenAI !== undefined) process.env.OPENAI_API_KEY = originalOpenAI;
  else delete process.env.OPENAI_API_KEY;
});

test("listConfiguredProviders sorts by region (EU first)", () => {
  const originalBerget = process.env.BERGET_API_KEY;
  const originalMistral = process.env.MISTRAL_API_KEY;
  const originalGrok = process.env.XAI_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.BERGET_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.XAI_API_KEY = "grok-test-key";
  process.env.BERGET_API_KEY = "berget-test-key";

  const configured = listConfiguredProviders();

  assert.equal(configured.length, 2);
  assert.equal(configured[0]?.id, "berget");
  assert.equal(configured[1]?.id, "grok");

  if (originalBerget !== undefined) process.env.BERGET_API_KEY = originalBerget;
  else delete process.env.BERGET_API_KEY;
  if (originalMistral !== undefined) process.env.MISTRAL_API_KEY = originalMistral;
  else delete process.env.MISTRAL_API_KEY;
  if (originalGrok !== undefined) process.env.XAI_API_KEY = originalGrok;
  else delete process.env.XAI_API_KEY;
  if (originalOpenAI !== undefined) process.env.OPENAI_API_KEY = originalOpenAI;
  else delete process.env.OPENAI_API_KEY;
});

test("getDefaultProvider returns first configured provider by region order", () => {
  const originalBerget = process.env.BERGET_API_KEY;
  const originalMistral = process.env.MISTRAL_API_KEY;
  const originalGrok = process.env.XAI_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.BERGET_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.XAI_API_KEY = "grok-test-key";
  process.env.MISTRAL_API_KEY = "mistral-test-key";

  const defaultProvider = getDefaultProvider();

  assert.ok(defaultProvider);
  assert.equal(defaultProvider.id, "mistral");

  if (originalBerget !== undefined) process.env.BERGET_API_KEY = originalBerget;
  else delete process.env.BERGET_API_KEY;
  if (originalMistral !== undefined) process.env.MISTRAL_API_KEY = originalMistral;
  else delete process.env.MISTRAL_API_KEY;
  if (originalGrok !== undefined) process.env.XAI_API_KEY = originalGrok;
  else delete process.env.XAI_API_KEY;
  if (originalOpenAI !== undefined) process.env.OPENAI_API_KEY = originalOpenAI;
  else delete process.env.OPENAI_API_KEY;
});

test("getDefaultProvider returns null when no providers are configured", () => {
  const originalBerget = process.env.BERGET_API_KEY;
  const originalMistral = process.env.MISTRAL_API_KEY;
  const originalGrok = process.env.XAI_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.BERGET_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const defaultProvider = getDefaultProvider();

  assert.equal(defaultProvider, null);

  if (originalBerget !== undefined) process.env.BERGET_API_KEY = originalBerget;
  else delete process.env.BERGET_API_KEY;
  if (originalMistral !== undefined) process.env.MISTRAL_API_KEY = originalMistral;
  else delete process.env.MISTRAL_API_KEY;
  if (originalGrok !== undefined) process.env.XAI_API_KEY = originalGrok;
  else delete process.env.XAI_API_KEY;
  if (originalOpenAI !== undefined) process.env.OPENAI_API_KEY = originalOpenAI;
  else delete process.env.OPENAI_API_KEY;
});

test("createCustomProvider creates a provider with correct isEU flag for SE region", () => {
  const provider = createCustomProvider({
    id: "custom-se",
    name: "Custom Swedish",
    endpoint: "https://api.custom.se/v1",
    region: "SE",
    envKey: "CUSTOM_SE_API_KEY",
  });

  assert.equal(provider.id, "custom-se");
  assert.equal(provider.region, "SE");
  assert.equal(provider.isEU, true);
});

test("createCustomProvider creates a provider with correct isEU flag for EU region", () => {
  const provider = createCustomProvider({
    id: "custom-eu",
    name: "Custom EU",
    endpoint: "https://api.custom.eu/v1",
    region: "EU",
    envKey: "CUSTOM_EU_API_KEY",
  });

  assert.equal(provider.isEU, true);
});

test("createCustomProvider creates a provider with correct isEU flag for US region", () => {
  const provider = createCustomProvider({
    id: "custom-us",
    name: "Custom US",
    endpoint: "https://api.custom.us/v1",
    region: "US",
    envKey: "CUSTOM_US_API_KEY",
  });

  assert.equal(provider.isEU, false);
});

test("configureCustomProvider returns configured provider when API key is set", () => {
  const original = process.env.CUSTOM_TEST_KEY;
  process.env.CUSTOM_TEST_KEY = "custom-api-key";

  const configured = configureCustomProvider({
    id: "custom-test",
    name: "Custom Test",
    endpoint: "https://api.custom.test/v1",
    region: "EU",
    envKey: "CUSTOM_TEST_KEY",
    defaultModel: "custom-model",
  });

  assert.ok(configured);
  assert.equal(configured.id, "custom-test");
  assert.equal(configured.getApiKey(), "custom-api-key");
  assert.equal(configured.defaultModel, "custom-model");
  assert.equal(configured.isEU, true);

  if (original !== undefined) {
    process.env.CUSTOM_TEST_KEY = original;
  } else {
    delete process.env.CUSTOM_TEST_KEY;
  }
});

test("configureCustomProvider returns null when API key is not set", () => {
  const original = process.env.MISSING_KEY;
  delete process.env.MISSING_KEY;

  const configured = configureCustomProvider({
    id: "custom-missing",
    name: "Custom Missing",
    endpoint: "https://api.missing/v1",
    region: "US",
    envKey: "MISSING_KEY",
  });

  assert.equal(configured, null);

  if (original !== undefined) {
    process.env.MISSING_KEY = original;
  }
});

test("formatProviderLabel includes [non-EU] for non-EU providers", () => {
  const grok = getProvider("grok");
  const berget = getProvider("berget");

  assert.ok(grok);
  assert.ok(berget);
  assert.equal(formatProviderLabel(grok), "Grok (xAI) [non-EU]");
  assert.equal(formatProviderLabel(berget), "Berget");
});

test("formatProviderList formats providers as a list", () => {
  const providers = listProviders().slice(0, 3);
  const formatted = formatProviderList(providers);

  assert.ok(formatted.includes("- Berget (SE)"));
  assert.ok(formatted.includes("- Mistral (EU)"));
  assert.ok(formatted.includes("[non-EU]"));
});

test("API keys are only read from environment variables", () => {
  const provider = getProvider("berget");
  assert.ok(provider);
  assert.equal(provider.envKey, "BERGET_API_KEY");

  const configured = configureProvider("berget");
  if (configured !== null) {
    assert.equal(typeof configured.getApiKey(), "string");
    assert.ok(configured.getApiKey().length > 0);
  }
});

test("no secrets appear in provider object itself", () => {
  const provider = getProvider("berget");
  assert.ok(provider);

  const providerJson = JSON.stringify(provider);
  assert.ok(!providerJson.includes("sk-"));
  assert.ok(!providerJson.includes("api_key"));
  assert.ok(!providerJson.includes("secret"));
});

test("configureProvider rejects whitespace-only API key", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "   ";

  const configured = configureProvider("berget");

  assert.equal(configured, null);

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("configureProvider rejects tab-only API key", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "\t\t";

  const configured = configureProvider("berget");

  assert.equal(configured, null);

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("toSafeProvider strips API key from configured provider", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "dummy";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const safe = toSafeProvider(configured);

  assert.equal(safe.id, "berget");
  assert.equal(safe.hasApiKey, true);
  assert.equal("apiKey" in safe, false);

  const safeJson = JSON.stringify(safe);
  assert.ok(!safeJson.includes("dummy"));
  assert.ok(!safeJson.includes("apiKey"));

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("toSafeProviders strips API keys from all providers", () => {
  const originalBerget = process.env.BERGET_API_KEY;
  const originalMistral = process.env.MISTRAL_API_KEY;
  const originalGrok = process.env.XAI_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.BERGET_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.BERGET_API_KEY = "berget-secret";
  process.env.MISTRAL_API_KEY = "mistral-secret";

  const configured = listConfiguredProviders();
  const safe = toSafeProviders(configured);

  assert.equal(safe.length, 2);
  for (const provider of safe) {
    assert.equal(provider.hasApiKey, true);
    assert.equal("apiKey" in provider, false);
  }

  const safeJson = JSON.stringify(safe);
  assert.ok(!safeJson.includes("berget-secret"));
  assert.ok(!safeJson.includes("mistral-secret"));

  if (originalBerget !== undefined) process.env.BERGET_API_KEY = originalBerget;
  else delete process.env.BERGET_API_KEY;
  if (originalMistral !== undefined) process.env.MISTRAL_API_KEY = originalMistral;
  else delete process.env.MISTRAL_API_KEY;
  if (originalGrok !== undefined) process.env.XAI_API_KEY = originalGrok;
  else delete process.env.XAI_API_KEY;
  if (originalOpenAI !== undefined) process.env.OPENAI_API_KEY = originalOpenAI;
  else delete process.env.OPENAI_API_KEY;
});

test("Berget defaultModel is google/gemma-4-31B-it", () => {
  const berget = getProvider("berget");
  assert.ok(berget);
  assert.equal(berget.defaultModel, "google/gemma-4-31B-it");
});

test("Grok defaultModel is undefined until confirmed", () => {
  const grok = getProvider("grok");
  assert.ok(grok);
  assert.equal(grok.defaultModel, undefined);
});

test("Mistral defaultModel is mistral-large-4-0", () => {
  const mistral = getProvider("mistral");
  assert.ok(mistral);
  assert.equal(mistral.defaultModel, "mistral-large-4-0");
});

test("OpenAI defaultModel is undefined until confirmed", () => {
  const openai = getProvider("openai");
  assert.ok(openai);
  assert.equal(openai.defaultModel, undefined);
});

test("client uses correct endpoint for Berget", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const url = getEndpointUrl(configured, "/chat/completions");
  assert.equal(url, "https://api.berget.ai/v1/chat/completions");

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client uses correct endpoint for Mistral", () => {
  const original = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "test-key";

  const configured = configureProvider("mistral");
  assert.ok(configured);

  const url = getEndpointUrl(configured, "/chat/completions");
  assert.equal(url, "https://api.mistral.ai/v1/chat/completions");

  if (original !== undefined) {
    process.env.MISTRAL_API_KEY = original;
  } else {
    delete process.env.MISTRAL_API_KEY;
  }
});

test("client uses correct endpoint for Grok", () => {
  const original = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-key";

  const configured = configureProvider("grok");
  assert.ok(configured);

  const url = getEndpointUrl(configured, "/chat/completions");
  assert.equal(url, "https://api.x.ai/v1/chat/completions");

  if (original !== undefined) {
    process.env.XAI_API_KEY = original;
  } else {
    delete process.env.XAI_API_KEY;
  }
});

test("client uses correct endpoint for OpenAI", () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";

  const configured = configureProvider("openai");
  assert.ok(configured);

  const url = getEndpointUrl(configured, "/chat/completions");
  assert.equal(url, "https://api.openai.com/v1/chat/completions");

  if (original !== undefined) {
    process.env.OPENAI_API_KEY = original;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
});

test("client calls correct Berget endpoint with mocked fetch and verifies auth and body", async () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-dummy";

  const configured = configureProvider("berget");
  assert.ok(configured);

  let capturedUrl: string | undefined;
  let capturedHeaders: Record<string, string> | undefined;
  let capturedBody: string | undefined;

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = url.toString();
    capturedHeaders = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
    );
    capturedBody = init?.body as string;
    return new Response(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "google/gemma-4-31B-it",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello!" },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createClient(configured, { fetch: mockFetch });
  await client.chatCompletion({
    model: "google/gemma-4-31B-it",
    messages: [{ role: "user", content: "Hi" }],
  });

  assert.equal(capturedUrl, "https://api.berget.ai/v1/chat/completions");
  assert.equal(capturedHeaders?.["Authorization"], "Bearer test-dummy");
  assert.equal(capturedHeaders?.["Content-Type"], "application/json");
  const body = JSON.parse(capturedBody ?? "{}");
  assert.equal(body.model, "google/gemma-4-31B-it");
  assert.deepEqual(body.messages, [{ role: "user", content: "Hi" }]);

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client calls correct Mistral endpoint with mocked fetch and verifies auth and body", async () => {
  const original = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "mistral-test";

  const configured = configureProvider("mistral");
  assert.ok(configured);

  let capturedUrl: string | undefined;
  let capturedHeaders: Record<string, string> | undefined;
  let capturedBody: string | undefined;

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = url.toString();
    capturedHeaders = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
    );
    capturedBody = init?.body as string;
    return new Response(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "mistral-large-4-0",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Bonjour!" },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createClient(configured, { fetch: mockFetch });
  await client.chatCompletion({
    model: "mistral-large-4-0",
    messages: [{ role: "user", content: "Hello" }],
  });

  assert.equal(capturedUrl, "https://api.mistral.ai/v1/chat/completions");
  assert.equal(capturedHeaders?.["Authorization"], "Bearer mistral-test");
  assert.equal(capturedHeaders?.["Content-Type"], "application/json");
  const body = JSON.parse(capturedBody ?? "{}");
  assert.equal(body.model, "mistral-large-4-0");
  assert.deepEqual(body.messages, [{ role: "user", content: "Hello" }]);

  if (original !== undefined) {
    process.env.MISTRAL_API_KEY = original;
  } else {
    delete process.env.MISTRAL_API_KEY;
  }
});

test("client calls correct Grok endpoint with mocked fetch and verifies auth and body", async () => {
  const original = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "grok-test";

  const configured = configureProvider("grok");
  assert.ok(configured);

  let capturedUrl: string | undefined;
  let capturedHeaders: Record<string, string> | undefined;
  let capturedBody: string | undefined;

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = url.toString();
    capturedHeaders = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
    );
    capturedBody = init?.body as string;
    return new Response(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "grok-4",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hi from Grok!" },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createClient(configured, { fetch: mockFetch });
  await client.chatCompletion({
    model: "grok-4",
    messages: [{ role: "user", content: "Hello" }],
  });

  assert.equal(capturedUrl, "https://api.x.ai/v1/chat/completions");
  assert.equal(capturedHeaders?.["Authorization"], "Bearer grok-test");
  assert.equal(capturedHeaders?.["Content-Type"], "application/json");
  const body = JSON.parse(capturedBody ?? "{}");
  assert.equal(body.model, "grok-4");
  assert.deepEqual(body.messages, [{ role: "user", content: "Hello" }]);

  if (original !== undefined) {
    process.env.XAI_API_KEY = original;
  } else {
    delete process.env.XAI_API_KEY;
  }
});

test("client throws on error response with sanitized message", async () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    return new Response('{"error": "Invalid API key"}', {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createClient(configured, { fetch: mockFetch });

  await assert.rejects(
    async () => {
      await client.chatCompletion({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      });
    },
    /Provider berget returned 401/,
  );

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("JSON.stringify of ConfiguredProvider redacts API key", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "super-secret";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const json = JSON.stringify(configured);
  assert.ok(!json.includes("super-secret"));
  assert.ok(json.includes("[REDACTED]"));
  assert.ok(json.includes('"id":"berget"'));

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("util.inspect of ConfiguredProvider redacts API key", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "super-secret";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const inspected = inspect(configured);
  assert.ok(!inspected.includes("super-secret"));
  assert.ok(inspected.includes("[REDACTED]") || inspected.includes("REDACTED"));

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("ConfiguredProvider getApiKey() returns the actual key", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "actual-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  assert.equal(configured.getApiKey(), "actual-key");

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client error message contains only provider id and status, no response body", async () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    return new Response('{"error": "Bad auth", "secret": "leaked-value"}', {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createClient(configured, { fetch: mockFetch });

  try {
    await client.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.fail("Should have thrown");
  } catch (error) {
    const message = (error as Error).message;
    assert.equal(message, "Provider berget returned 401");
    assert.ok(!message.includes("leaked-value"));
    assert.ok(!message.includes("Bad auth"));
  }

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client error message never includes API key even if echoed by provider", async () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "my-secret-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    return new Response(`{"error": "Invalid key: my-secret-key"}`, {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createClient(configured, { fetch: mockFetch });

  try {
    await client.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.fail("Should have thrown");
  } catch (error) {
    const message = (error as Error).message;
    assert.ok(!message.includes("my-secret-key"));
    assert.equal(message, "Provider berget returned 401");
  }

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client.provider does not expose apiKey", () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "secret-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = createClient(configured, { fetch: mockFetch });

  assert.equal(client.provider.id, "berget");
  assert.equal(client.provider.hasApiKey, true);
  assert.equal("apiKey" in client.provider, false);

  const json = JSON.stringify(client.provider);
  assert.ok(!json.includes("secret-key"));

  const inspected = inspect(client.provider);
  assert.ok(!inspected.includes("secret-key"));

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client passes AbortSignal to fetch", async () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  let receivedSignal: AbortSignal | undefined;

  const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    receivedSignal = init?.signal as AbortSignal;
    return new Response(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "test-model",
        choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createClient(configured, { fetch: mockFetch, timeoutMs: 5000 });
  await client.chatCompletion({
    model: "test-model",
    messages: [{ role: "user", content: "Hi" }],
  });

  assert.ok(receivedSignal !== undefined);
  assert.ok(receivedSignal instanceof AbortSignal);

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("client actually aborts a hanging call after timeout", async () => {
  const original = process.env.BERGET_API_KEY;
  process.env.BERGET_API_KEY = "test-key";

  const configured = configureProvider("berget");
  assert.ok(configured);

  let wasAborted = false;

  const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        wasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    });
  };

  const client = createClient(configured, { fetch: mockFetch, timeoutMs: 50 });

  const startTime = Date.now();
  await assert.rejects(
    async () => {
      await client.chatCompletion({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      });
    },
    (err: Error) => err.name === "AbortError",
  );
  const elapsed = Date.now() - startTime;

  assert.ok(wasAborted, "fetch should have been aborted");
  assert.ok(elapsed >= 40 && elapsed < 500, `timeout should trigger around 50ms, got ${elapsed}ms`);

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("network error message does not leak API key", async () => {
  const original = process.env.BERGET_API_KEY;
  const secretKey = "fake-secret-key-12345";
  process.env.BERGET_API_KEY = secretKey;

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    throw new Error(`Connection failed to endpoint with key ${secretKey}`);
  };

  const client = createClient(configured, { fetch: mockFetch });

  try {
    await client.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.fail("Should have thrown");
  } catch (error) {
    const err = error as Error;
    assert.ok(!err.message.includes(secretKey), "API key should not be in error message");
    assert.ok(err.message.includes("[REDACTED]"), "API key should be redacted");
  }

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("network error stack does not leak API key", async () => {
  const original = process.env.BERGET_API_KEY;
  const secretKey = "fake-stack-test-key";
  process.env.BERGET_API_KEY = secretKey;

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    const err = new Error("Network failure");
    err.stack = `Error: Network failure with ${secretKey}\n    at mockFetch`;
    throw err;
  };

  const client = createClient(configured, { fetch: mockFetch });

  try {
    await client.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.fail("Should have thrown");
  } catch (error) {
    const err = error as Error;
    assert.ok(!err.stack?.includes(secretKey), "API key should not be in error stack");
    assert.ok(err.stack?.includes("[REDACTED]"), "API key should be redacted in stack");
  }

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("network error cause chain does not leak API key", async () => {
  const original = process.env.BERGET_API_KEY;
  const secretKey = "fake-cause-chain-key";
  process.env.BERGET_API_KEY = secretKey;

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    const innerError = new Error(`Inner error with ${secretKey}`);
    const outerError = new Error(`Outer error with ${secretKey}`, { cause: innerError });
    throw outerError;
  };

  const client = createClient(configured, { fetch: mockFetch });

  try {
    await client.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.fail("Should have thrown");
  } catch (error) {
    const err = error as Error;
    assert.ok(!err.message.includes(secretKey), "API key should not be in outer error message");
    assert.ok(err.message.includes("[REDACTED]"), "API key should be redacted in outer message");

    const cause = err.cause as Error;
    assert.ok(cause instanceof Error, "cause should be an Error");
    assert.ok(!cause.message.includes(secretKey), "API key should not be in cause message");
    assert.ok(cause.message.includes("[REDACTED]"), "API key should be redacted in cause message");
  }

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("util.inspect with customInspect:false and getters:true does not show API key", () => {
  const original = process.env.BERGET_API_KEY;
  const secretKey = "fake-inspect-test-key";
  process.env.BERGET_API_KEY = secretKey;

  const configured = configureProvider("berget");
  assert.ok(configured);

  const inspected = inspect(configured, { customInspect: false, getters: true });

  assert.ok(!inspected.includes(secretKey), "API key should not appear in deep inspection");

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});

test("util.inspect of client with customInspect:false and getters:true does not show API key", () => {
  const original = process.env.BERGET_API_KEY;
  const secretKey = "fake-client-inspect-key";
  process.env.BERGET_API_KEY = secretKey;

  const configured = configureProvider("berget");
  assert.ok(configured);

  const mockFetch = async () => {
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = createClient(configured, { fetch: mockFetch });

  const inspected = inspect(client, { customInspect: false, getters: true, depth: 10 });

  assert.ok(!inspected.includes(secretKey), "API key should not appear in deep client inspection");

  if (original !== undefined) {
    process.env.BERGET_API_KEY = original;
  } else {
    delete process.env.BERGET_API_KEY;
  }
});
