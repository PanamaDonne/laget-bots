import { SV } from "./swedish.ts";

export type RadioArgs = {
  liveChoice: boolean;
  audioDevice: string | null;
};

export function parseRadioArgs(argv: readonly string[]): RadioArgs {
  let liveChoice = false;
  let audioDevice: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--live") {
      liveChoice = true;
      continue;
    }
    if (arg === "--audio-device") {
      const device = argv[index + 1];
      if (device === undefined || device.startsWith("-") || device.trim().length === 0) {
        throw new Error(SV.audioMissing);
      }
      audioDevice = device;
      index += 1;
      continue;
    }
    throw new Error(SV.unknownArg);
  }
  return { liveChoice, audioDevice };
}

export function liveStartupLine(liveChoice: boolean, apiKey: string | undefined): string | null {
  if (!liveChoice) return null;
  if (apiKey !== undefined && apiKey.trim().length > 0) return null;
  return SV.liveKeyMissing;
}
