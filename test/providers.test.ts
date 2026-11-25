import assert from "node:assert/strict";
import test from "node:test";

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
} from "../src/providers.ts";

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
  assert.equal(configured.apiKey, "test-key-12345");
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
  assert.equal(configured.apiKey, "custom-api-key");
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
    assert.equal(typeof configured.apiKey, "string");
    assert.ok(configured.apiKey.length > 0);
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
