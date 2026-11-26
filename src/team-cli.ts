import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runTeamFromFile } from "./team-run.ts";

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  const goal = process.argv[3];
  if (configPath === undefined || goal === undefined || configPath === "" || goal.trim() === "") {
    console.error('Användning: npm run team -- <konfiguration.json> "<mål>"');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runTeamFromFile(configPath, goal);
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
