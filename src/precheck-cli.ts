import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { readProcessCgroupLimits } from "./cgroup.ts";
import { buildPrecheckReport } from "./precheck.ts";
import { SV } from "./swedish.ts";
import { envForLocalModels } from "./worker-env.ts";
import { ORDINARY_ROOM_SPEECH, measureFalseAlarms } from "./wake.ts";

const VOICE_FILE = "models/sv_SE-nst-medium.onnx";
const UTTERANCE_FILE = "test/fixtures/utterance-16k-s16le.pcm";
const mockedChatReply = "Klockan är tre.";

export async function runPrecheck(): Promise<void> {
  const alarms = measureFalseAlarms(ORDINARY_ROOM_SPEECH);
  const latencyMs = await measureLocalReplyLatency();
  if (latencyMs === null) {
    process.stderr.write(`${SV.voiceMissing}\n`);
    process.exitCode = 1;
    return;
  }
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
    modelsRan: true,
    enforcedCpus: limits.cpus,
    enforcedMemoryMb: limits.memoryMb,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

function offlineEnv(): NodeJS.ProcessEnv {
  const env = envForLocalModels(process.env);
  env.HF_HUB_OFFLINE = "1";
  env.HF_HUB_DISABLE_TELEMETRY = "1";
  env.TRANSFORMERS_OFFLINE = "1";
  return env;
}

async function measureLocalReplyLatency(): Promise<number | null> {
  if (!existsSync(VOICE_FILE) || !existsSync(UTTERANCE_FILE)) return null;
  const utterance = readFileSync(UTTERANCE_FILE);
  if (utterance.length < 2) return null;
  const child = spawn("python3", ["scripts/voice-worker.py"], {
    stdio: ["pipe", "pipe", "ignore"],
    env: offlineEnv(),
  });
  const lines = new LineQueue(child);
  try {
    const ready = JSON.parse((await lines.next(180_000)) ?? "") as { op?: string };
    if (ready.op !== "ready") return null;
    const speechEndedAt = Date.now();
    const heard = await ask(child, lines, {
      op: "transcribe",
      pcmBase64: utterance.toString("base64"),
      sampleRateHz: 16_000,
    });
    if (heard?.op !== "transcript") return null;
    const reply = await ask(child, lines, { op: "speak", text: mockedChatReply });
    if (reply?.op !== "audio" || typeof reply.pcmBase64 !== "string" || reply.pcmBase64.length === 0) {
      return null;
    }
    return Date.now() - speechEndedAt;
  } catch {
    return null;
  } finally {
    child.stdin?.end();
    child.kill();
  }
}

async function ask(
  child: ChildProcess,
  lines: LineQueue,
  request: { op: string; text?: string; pcmBase64?: string; sampleRateHz?: number },
): Promise<{ op?: string; pcmBase64?: string; sampleRateHz?: number } | null> {
  child.stdin?.write(`${JSON.stringify(request)}\n`);
  const line = await lines.next(180_000);
  if (line === null) return null;
  return JSON.parse(line) as { op?: string; pcmBase64?: string; sampleRateHz?: number };
}

class LineQueue {
  private readonly lines: string[] = [];
  private readonly waiters: Array<(line: string) => void> = [];

  constructor(child: ChildProcess) {
    if (child.stdout === null) return;
    createInterface({ input: child.stdout }).on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter !== undefined) waiter(line);
      else this.lines.push(line);
    });
  }

  next(timeoutMs: number): Promise<string | null> {
    const existing = this.lines.shift();
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolveNext) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(onLine);
        if (index >= 0) this.waiters.splice(index, 1);
        resolveNext(null);
      }, timeoutMs);
      const onLine = (line: string): void => {
        clearTimeout(timer);
        resolveNext(line);
      };
      this.waiters.push(onLine);
    });
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
