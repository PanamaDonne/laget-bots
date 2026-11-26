import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runTeamFromFile } from "./team-run.ts";

const USAGE = 'Användning: npm run team -- <konfiguration.json> "<mål>" [--max-tokens <antal>]';

export type TeamCliArgs =
  | { ok: true; configPath: string; goal: string; maxTokens?: number }
  | { ok: false; error: string };

export function parseTeamCliArgs(argv: readonly string[]): TeamCliArgs {
  const positionals: string[] = [];
  let maxTokens: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") {
      continue;
    }
    if (arg === "--max-tokens" || arg.startsWith("--max-tokens=")) {
      const raw = arg === "--max-tokens" ? argv[index + 1] : arg.slice("--max-tokens=".length);
      if (arg === "--max-tokens") {
        index += 1;
      }
      const parsed = parseTokenCap(raw);
      if (!parsed.ok) {
        return parsed;
      }
      maxTokens = parsed.value;
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, error: `Okänt argument: ${arg}` };
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
    return { ok: false, error: `Okänt argument: ${extra}` };
  }
  return { ok: true, configPath, goal, maxTokens };
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
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runTeamFromFile(parsed.configPath, parsed.goal, {
      maxTokens: parsed.maxTokens,
    });
    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teamkörningen misslyckades";
    console.error(message);
    process.exitCode = 1;
  }
}

if (isDirectRun()) {
  void main();
}
