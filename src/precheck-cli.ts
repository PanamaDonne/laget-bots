import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readProcessCgroupLimits } from "./cgroup.ts";
import { buildPrecheckReport } from "./precheck.ts";
import { SV } from "./swedish.ts";
import { envForLocalModels } from "./worker-env.ts";
import { ORDINARY_ROOM_SPEECH, measureFalseAlarms } from "./wake.ts";

const VOICE_FILE = "models/sv_SE-nst-medium.onnx";
const WHISPER_READY = "models/whisper/models--KBLab--kb-whisper-base/refs/main";

export async function runPrecheck(): Promise<void> {
  const alarms = measureFalseAlarms(ORDINARY_ROOM_SPEECH);
  const latencyMs = await measureInstalledModels();
  const limits = readProcessCgroupLimits((path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  });
  const report = buildPrecheckReport({
    latencyMs,
    falseAlarms: alarms.falseAlarms,
    checked: alarms.checked,
    modelsRan: latencyMs !== null,
    enforcedCpus: limits.cpus,
    enforcedMemoryMb: limits.memoryMb,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function measureInstalledModels(): Promise<number | null> {
  if (!existsSync(VOICE_FILE) || !existsSync(WHISPER_READY)) return null;
  const child = spawn("python3", ["scripts/voice-worker.py"], {
    stdio: ["pipe", "pipe", "ignore"],
    env: envForLocalModels(process.env),
  });
  const lines: string[] = [];
  let notify: (() => void) | null = null;
  createInterface({ input: child.stdout }).on("line", (line) => {
    lines.push(line);
    notify?.();
  });
  const next = async (): Promise<string | null> => {
    const started = Date.now();
    while (lines.length === 0 && Date.now() - started < 60_000) {
      await new Promise<void>((resolveWait) => {
        notify = resolveWait;
        setTimeout(resolveWait, 200);
      });
      notify = null;
    }
    return lines.shift() ?? null;
  };
  try {
    const ready = JSON.parse((await next()) ?? "{}") as { op?: string };
    if (ready.op !== "ready") return null;
    const tone = Buffer.alloc(16_000);
    for (let index = 0; index < tone.length; index += 2) tone.writeInt16LE(index % 4 === 0 ? 8_000 : -8_000, index);
    const started = Date.now();
    child.stdin.write(
      `${JSON.stringify({ op: "transcribe", pcmBase64: tone.toString("base64"), sampleRateHz: 16_000 })}\n`,
    );
    const transcript = JSON.parse((await next()) ?? "{}") as { op?: string };
    if (transcript.op !== "transcript") return null;
    child.stdin.write(`${JSON.stringify({ op: "speak", text: "Hej." })}\n`);
    const audio = JSON.parse((await next()) ?? "{}") as { op?: string };
    if (audio.op !== "audio") return null;
    return Date.now() - started;
  } catch {
    return null;
  } finally {
    child.stdin.end();
    child.kill();
  }
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
