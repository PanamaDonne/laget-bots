import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { captureArgs, isSilence, playbackArgs } from "./audio.ts";
import { parseRadioArgs } from "./cli.ts";
import { loadConfigFile, resolveConfig, type RadioConfig } from "./config.ts";
import { type Ledger } from "./cost.ts";
import { readLedgerFile, writeLedgerFile } from "./ledger-file.ts";
import { Lamp } from "./lamp.ts";
import { completeChat } from "./provider.ts";
import { SV } from "./swedish.ts";
import { handleHeard } from "./turn.ts";
import { envForLocalModels } from "./worker-env.ts";

const FRAME_BYTES = 16_000 * 2;
const WINDOW_BYTES = FRAME_BYTES * 2;

type VoiceReply = { pcm: Buffer; sampleRateHz: number };

class LineQueue {
  private readonly lines: string[] = [];
  private readonly waiters: Array<(line: string) => void> = [];

  push(line: string): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) waiter(line);
    else this.lines.push(line);
  }

  next(): Promise<string> {
    const existing = this.lines.shift();
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolveNext) => {
      this.waiters.push(resolveNext);
    });
  }
}

async function main(): Promise<void> {
  const args = parseRadioArgs(process.argv.slice(2));
  const config = loadRuntimeConfig(args.audioDevice);
  const voice = await startVoice();
  const ledgerRoot = resolve("data");
  const ledger: Ledger = readLedgerFile(ledgerRoot, new Date());
  let usedTokens = 0;
  let armed = false;
  let pending = Buffer.alloc(0);
  let skipBytes = 0;
  const lamp = new Lamp();
  process.stderr.write(`${SV.listeningForWake}\n`);

  const mic = spawn("arecord", captureArgs(config.audioDevice), { stdio: ["ignore", "pipe", "pipe"] });
  mic.on("error", () => {
    process.stderr.write(`${SV.audioMissing}\n`);
    process.exitCode = 1;
  });

  for await (const frame of framesFrom(mic.stdout)) {
    if (skipBytes > 0) {
      skipBytes -= frame.length;
      continue;
    }
    pending = Buffer.concat([pending, frame]);
    const speechEnded = armed && isSilence(frame, 500) && pending.length > FRAME_BYTES;
    const wakeWindow = !armed && pending.length >= WINDOW_BYTES;
    if (!speechEnded && !wakeWindow) continue;

    const pcm = pending;
    pending = Buffer.alloc(0);
    const speechEndedAt = Date.now();
    const text = await voice.transcribe(pcm);
    const result = await handleHeard({
      text,
      playbackActive: false,
      pushToTalk: false,
      armed,
      speechEndedAt,
      lamp,
      complete: (command) => replyTo(command, args.liveChoice, config, ledger, ledgerRoot, usedTokens),
      speak: async (speech) => {
        const audio = await voice.speak(speech);
        const firstByteAt = await playPcm(config.audioDevice, audio);
        const playedMs = Math.max(0, Date.now() - firstByteAt);
        skipBytes = Math.ceil((16_000 * 2 * (playedMs + 400)) / 1_000);
        return { firstByteAt };
      },
    });
    armed = result.armed;
    if (result.spoke) usedTokens = 0;
  }
}

function loadRuntimeConfig(audioDevice: string | null): RadioConfig {
  const path = resolve("radio-days.config.json");
  const file =
    existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  const loaded = loadConfigFile(file);
  return audioDevice === null ? loaded : resolveConfig(audioDevice);
}

async function replyTo(
  command: string,
  liveChoice: boolean,
  config: RadioConfig,
  ledger: Ledger,
  ledgerRoot: string,
  usedTokens: number,
): Promise<{ text: string; calledModel: boolean }> {
  const price = readOptionalInt(process.env.RADIO_DAYS_ORE_PER_MILLION);
  const result = await completeChat({
    liveChoice,
    apiKey: liveChoice ? (process.env.RADIO_DAYS_API_KEY ?? "") : "",
    baseUrl: process.env.RADIO_DAYS_PROVIDER_BASE_URL ?? "",
    model: process.env.RADIO_DAYS_MODEL ?? "",
    providerId: process.env.RADIO_DAYS_PROVIDER_ID ?? config.providerId,
    userText: command,
    tokenCap: config.tokenCap,
    usedTokens,
    orePerMillion: price,
    ledger,
    now: new Date(),
    fetchImpl: (url, init) => fetch(url, init),
  });
  ledger.month = result.ledger.month;
  ledger.spentOre = result.ledger.spentOre;
  writeLedgerFile(ledgerRoot, ledger);
  return { text: result.text, calledModel: result.calledModel };
}

function readOptionalInt(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function startVoice(): Promise<{
  transcribe(pcm: Buffer): Promise<string>;
  speak(text: string): Promise<VoiceReply>;
}> {
  const child = spawn("python3", ["scripts/voice-worker.py"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: envForLocalModels(process.env),
  });
  const queue = new LineQueue();
  let readySeen = false;
  createInterface({ input: child.stdout }).on("line", (line) => queue.push(line));
  const wakeClosed = (): void => {
    if (!readySeen) queue.push("{\"op\":\"error\"}");
  };
  child.on("error", wakeClosed);
  child.on("close", wakeClosed);
  const ready = JSON.parse(await queue.next()) as { op?: string };
  readySeen = ready.op === "ready";
  if (ready.op !== "ready") {
    process.stderr.write(`${SV.voiceMissing}\n`);
    process.exit(1);
  }
  return {
    async transcribe(pcm: Buffer): Promise<string> {
      child.stdin.write(
        `${JSON.stringify({ op: "transcribe", pcmBase64: pcm.toString("base64"), sampleRateHz: 16_000 })}\n`,
      );
      const response = JSON.parse(await queue.next()) as { text?: string };
      return typeof response.text === "string" ? response.text : "";
    },
    async speak(text: string): Promise<VoiceReply> {
      child.stdin.write(`${JSON.stringify({ op: "speak", text })}\n`);
      const response = JSON.parse(await queue.next()) as { pcmBase64?: string; sampleRateHz?: number };
      if (typeof response.pcmBase64 !== "string" || typeof response.sampleRateHz !== "number") {
        throw new Error(SV.voiceMissing);
      }
      return { pcm: Buffer.from(response.pcmBase64, "base64"), sampleRateHz: response.sampleRateHz };
    },
  };
}

async function* framesFrom(stream: NodeJS.ReadableStream): AsyncGenerator<Buffer> {
  const chunks: Buffer[] = [];
  let ended = false;
  let notify: (() => void) | null = null;
  stream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    notify?.();
  });
  const stop = (): void => {
    ended = true;
    notify?.();
  };
  stream.on("end", stop);
  stream.on("error", stop);
  while (!ended || chunks.length > 0) {
    if (chunks.length === 0) {
      await new Promise<void>((resolveWait) => {
        notify = resolveWait;
      });
      notify = null;
      continue;
    }
    const chunk = chunks.shift();
    if (chunk !== undefined) yield chunk;
  }
}

async function playPcm(device: string, audio: VoiceReply): Promise<number> {
  const child = spawn("aplay", playbackArgs(device, audio.sampleRateHz), {
    stdio: ["pipe", "ignore", "pipe"],
  });
  const firstByteAt = Date.now();
  child.stdin.write(audio.pcm);
  child.stdin.end();
  await new Promise<void>((resolveDone, reject) => {
    child.on("error", () => reject(new Error(SV.audioMissing)));
    child.on("close", (code) => {
      if (code === 0) resolveDone();
      else reject(new Error(SV.audioMissing));
    });
  });
  return firstByteAt;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  main().catch(() => {
    process.stderr.write(`${SV.failed}\n`);
    process.exitCode = 1;
  });
}
