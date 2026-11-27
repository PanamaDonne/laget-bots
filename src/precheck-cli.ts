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
const USER_UTTERANCE = "Kör Radio vad är klockan";
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

async function measureLocalReplyLatency(): Promise<number | null> {
  if (!existsSync(VOICE_FILE)) return null;
  const child = spawn("python3", ["scripts/voice-worker.py"], {
    stdio: ["pipe", "pipe", "ignore"],
    env: envForLocalModels(process.env),
  });
  const lines = new LineQueue(child);
  try {
    const ready = JSON.parse((await lines.next(180_000)) ?? "") as { op?: string };
    if (ready.op !== "ready") return null;
    const spoken = await ask(child, lines, { op: "speak", text: USER_UTTERANCE });
    if (spoken?.op !== "audio" || typeof spoken.pcmBase64 !== "string" || spoken.pcmBase64.length === 0) {
      return null;
    }
    if (typeof spoken.sampleRateHz !== "number") return null;
    const pcm = pcmTo16k(Buffer.from(spoken.pcmBase64, "base64"), spoken.sampleRateHz);
    const speechEndedAt = Date.now();
    const heard = await ask(child, lines, {
      op: "transcribe",
      pcmBase64: pcm.toString("base64"),
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

function pcmTo16k(pcm: Buffer, sampleRateHz: number): Buffer {
  if (sampleRateHz === 16_000) return pcm;
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0 || sampleRateHz <= 0) return Buffer.alloc(0);
  const outSamples = Math.max(1, Math.floor((samples * 16_000) / sampleRateHz));
  const out = Buffer.alloc(outSamples * 2);
  for (let index = 0; index < outSamples; index += 1) {
    const source = Math.min(samples - 1, Math.floor((index * sampleRateHz) / 16_000));
    out.writeInt16LE(pcm.readInt16LE(source * 2), index * 2);
  }
  return out;
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
