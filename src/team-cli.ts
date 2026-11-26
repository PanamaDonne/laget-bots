import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { redactConfiguredSecrets, runTeamFromFile } from "./team-run.ts";

const USAGE =
  'Användning: npm run team -- <konfiguration.json> "<mål>" [--live] [--provider <id>] [--model <id>] [--max-tokens <antal>]';

export type TeamCliArgs =
  | {
      ok: true;
      configPath: string;
      goal: string;
      maxTokens?: number;
      providerId?: string;
      model?: string;
      live: boolean;
    }
  | { ok: false; error: string };

export function parseTeamCliArgs(argv: readonly string[]): TeamCliArgs {
  const positionals: string[] = [];
  let maxTokens: number | undefined;
  let providerId: string | undefined;
  let model: string | undefined;
  let live = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") {
      continue;
    }
    if (arg === "--max-tokens" || arg.startsWith("--max-tokens=")) {
      const taken = readFlagValue(argv, index, arg, "--max-tokens");
      index = taken.index;
      const parsed = parseTokenCap(taken.raw);
      if (!parsed.ok) {
        return parsed;
      }
      maxTokens = parsed.value;
      continue;
    }
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--provider" || arg.startsWith("--provider=")) {
      const taken = readFlagValue(argv, index, arg, "--provider");
      index = taken.index;
      const parsed = requireFlagValue(taken.raw, "Leverantören saknas");
      if (!parsed.ok) {
        return parsed;
      }
      providerId = parsed.value;
      continue;
    }
    if (arg === "--model" || arg.startsWith("--model=")) {
      const taken = readFlagValue(argv, index, arg, "--model");
      index = taken.index;
      const parsed = requireFlagValue(taken.raw, "Modellen saknas");
      if (!parsed.ok) {
        return parsed;
      }
      model = parsed.value;
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, error: "Okänt argument." };
    }
    positionals.push(arg);
  }

  const configPath = positionals[0];
  const goal = positionals[1];
  if (configPath === undefined || goal === undefined || configPath === "" || goal.trim() === "") {
    return { ok: false, error: USAGE };
  }
  const extra = positionals[2];
  if (extra !== undefined) {
    return { ok: false, error: "Okänt argument." };
  }
  return { ok: true, configPath, goal, maxTokens, providerId, model, live };
}

function readFlagValue(
  argv: readonly string[],
  index: number,
  arg: string,
  flag: string,
): { raw: string | undefined; index: number } {
  if (arg === flag) {
    return { raw: argv[index + 1], index: index + 1 };
  }
  return { raw: arg.slice(flag.length + 1), index };
}

function requireFlagValue(
  raw: string | undefined,
  missing: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw.trim() === "" || raw.trim().startsWith("-")) {
    return { ok: false, error: missing };
  }
  return { ok: true, value: raw.trim() };
}

function parseTokenCap(raw: string | undefined): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
    return { ok: false, error: "Tokentaket måste vara ett positivt heltal" };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: "Tokentaket måste vara ett positivt heltal" };
  }
  return { ok: true, value };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

async function main(): Promise<void> {
  const parsed = parseTeamCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(redactConfiguredSecrets(parsed.error));
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runTeamFromFile(parsed.configPath, parsed.goal, {
      maxTokens: parsed.maxTokens,
      providerId: parsed.providerId,
      model: parsed.model,
      live: parsed.live,
    });
    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teamkörningen misslyckades";
    console.error(redactConfiguredSecrets(message));
    process.exitCode = 1;
  }
}

if (isDirectRun()) {
  void main();
}
