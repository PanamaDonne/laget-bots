import { WHISPER_BASE } from "./models.ts";

export const sharedConfig = {
  whisperModel: WHISPER_BASE,
  piperVoice: "sv_SE-nst-medium",
  wakePhrase: "Kör Radio",
  sampleRateHz: 16_000,
  tokenCap: 4_000,
  providerId: "eu-chat",
} as const;

export type RadioConfig = typeof sharedConfig & {
  audioDevice: string;
};

export function resolveConfig(audioDevice: string): RadioConfig {
  return { ...sharedConfig, audioDevice };
}

export function loadConfigFile(file: Record<string, unknown>): RadioConfig {
  const audioDevice =
    typeof file.audioDevice === "string" && file.audioDevice.length > 0 ? file.audioDevice : "default";
  return resolveConfig(audioDevice);
}
