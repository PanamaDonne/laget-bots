import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { listProviders } from "./providers.ts";

const ENV_READ_ERROR = "Kunde inte läsa .env.";

/** Fill missing provider keys from a `.env` file. A key already in `env` wins. */
export function loadProviderEnvFile(directory: string, env: NodeJS.ProcessEnv = process.env): void {
  const dir = resolve(directory);
  let realDir: string;
  try {
    realDir = realpathSync(dir);
  } catch {
    return;
  }

  const envPath = join(dir, ".env");
  let listed: ReturnType<typeof lstatSync>;
  try {
    listed = lstatSync(envPath);
  } catch {
    return;
  }
  if (!listed.isFile() && !listed.isSymbolicLink()) {
    throw new Error(ENV_READ_ERROR);
  }

  let realFile: string;
  try {
    realFile = realpathSync(envPath);
  } catch {
    throw new Error(ENV_READ_ERROR);
  }

  const expected = join(realDir, ".env");
  const prefix = realDir.endsWith(sep) ? realDir : `${realDir}${sep}`;
  if (realFile !== expected || !realFile.startsWith(prefix)) {
    throw new Error(ENV_READ_ERROR);
  }

  let text: string;
  try {
    text = readFileSync(realFile, "utf8");
  } catch {
    throw new Error(ENV_READ_ERROR);
  }
  applyProviderEnv(text, env);
}

function applyProviderEnv(text: string, env: NodeJS.ProcessEnv): void {
  const allowed = new Set(listProviders().map((provider) => provider.envKey));
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const line of source.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed === null || !allowed.has(parsed.key)) {
      continue;
    }
    if (env[parsed.key] !== undefined) {
      continue;
    }
    if (parsed.value.trim() === "") {
      continue;
    }
    env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const text = line.trim();
  if (text === "" || text.startsWith("#")) {
    return null;
  }
  const body = text.startsWith("export ") ? text.slice("export ".length).trim() : text;
  const separator = body.indexOf("=");
  if (separator <= 0) {
    return null;
  }
  const key = body.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }
  return { key, value: unquoteEnvValue(body.slice(separator + 1)) };
}

function unquoteEnvValue(raw: string): string {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.length >= 2 && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
