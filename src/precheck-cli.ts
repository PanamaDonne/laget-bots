import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readProcessCgroupLimits } from "./cgroup.ts";
import { Lamp } from "./lamp.ts";
import { buildPrecheckReport } from "./precheck.ts";
import { SV } from "./swedish.ts";
import { handleHeard } from "./turn.ts";
import { ORDINARY_ROOM_SPEECH, measureFalseAlarms } from "./wake.ts";

export async function runPrecheck(): Promise<void> {
  const alarms = measureFalseAlarms(ORDINARY_ROOM_SPEECH);
  const speechEndedAt = Date.now();
  const result = await handleHeard({
    text: "Kör Radio vad är klockan",
    playbackActive: false,
    pushToTalk: false,
    armed: false,
    speechEndedAt,
    lamp: new Lamp(),
    complete: async () => ({ text: "Den är tre.", calledModel: false }),
    speak: async () => ({ firstByteAt: Date.now() }),
  });
  const limits = readProcessCgroupLimits((path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  });
  const report = buildPrecheckReport({
    latencyMs: result.latencyMs ?? 0,
    falseAlarms: alarms.falseAlarms,
    checked: alarms.checked,
    modelsRan: false,
    enforcedCpus: limits.cpus,
    enforcedMemoryMb: limits.memoryMb,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  runPrecheck().catch(() => {
    process.stderr.write(`${SV.failed}\n`);
    process.exitCode = 1;
  });
}
