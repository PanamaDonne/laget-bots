const HIDDEN_FROM_LOCAL_MODELS = ["RADIO_DAYS_API_KEY", "RADIO_DAYS_PROVIDER_BASE_URL"] as const;

export function envForLocalModels(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  for (const name of HIDDEN_FROM_LOCAL_MODELS) {
    delete copy[name];
  }
  return copy;
}
