import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { captureArgs, playbackArgs, watchMicrophone, whenPlayerExits } from "./audio.ts";
import { liveStartupLine, parseRadioArgs, reportedFailure } from "./cli.ts";
import { loadConfigFile, resolveConfig, type RadioConfig } from "./config.ts";
import { CAP_ORE, stockholmMonth, type Ledger } from "./cost.ts";
import { readLedgerFile, writeLedgerFile } from "./ledger-file.ts";
import { Lamp } from "./lamp.ts";
import { audibleSlice, decideListen } from "./listen.ts";
import { completeChat } from "./provider.ts";
import { SV } from "./swedish.ts";
import { handleHeard, settleAfterTurn } from "./turn.ts";
import { envForLocalModels } from "./worker-env.ts";

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

export async function runRadioLoop(input: {
  frames: AsyncIterable<Buffer>;
  micBytes: { received: number };
  transcribe: (pcm: Buffer) => Promise<string>;
  complete: (
    command: string,
    usedTokens: number,
  ) => Promise<{ text: string; calledModel: boolean; usedTokens: number }>;
  speak: (text: string) => Promise<VoiceReply>;
  play: (audio: VoiceReply) => Promise<number>;
  now?: () => number;
  onLatency?: (latencyMs: number) => void;
}): Promise<void> {
  const now = input.now ?? Date.now;
  let usedTokens = 0;
  let armed = false;
  let armedAt: number | null = null;
  let pending: Buffer = Buffer.alloc(0);
  let readBytes = 0;
  let echoFrom = 0;
  let echoUntil = 0;
  const lamp = new Lamp();

  for await (const raw of input.frames) {
    const frameStart = readBytes;
    readBytes += raw.length;
    const frame = audibleSlice({ frameStart, frame: raw, echoFrom, echoUntil });
    if (frame === null) continue;
    pending = Buffer.concat([pending, frame]);
    const decision = decideListen({
      armed,
      armedAt,
      now: now(),
      pending,
      frame,
    });
    if (decision === "wait") continue;
    if (decision === "disarm") {
      ({ armed, armedAt, pending, usedTokens } = settleAfterTurn(
        { armed, armedAt, pending, usedTokens },
        { kind: "timeout" },
        now(),
      ));
      lamp.set("idle");
      continue;
    }
    if (decision === "skip-silent") {
      pending = Buffer.alloc(0);
      continue;
    }

    const pcm = pending;
    pending = Buffer.alloc(0);
    const speechEndedAt = now();
    try {
      const text = await input.transcribe(pcm);
      const wasArmed = armed;
      const result = await handleHeard({
        text,
        playbackActive: false,
        pushToTalk: false,
        armed,
        speechEndedAt,
        lamp,
        complete: (command) => input.complete(command, usedTokens),
        speak: async (speech) => {
          const audio = await input.speak(speech);
          const from = input.micBytes.received;
          const firstByteAt = await input.play(audio);
          echoFrom = from;
          echoUntil = input.micBytes.received + 16_000 * 2 * 0.4;
          return { firstByteAt };
        },
      });
      if (result.latencyMs !== null) input.onLatency?.(result.latencyMs);
      ({ armed, armedAt, pending, usedTokens } = settleAfterTurn(
        { armed: wasArmed, armedAt, pending, usedTokens },
        {
          kind: "reply",
          spoke: result.spoke,
          heardArmed: result.armed,
          reportedTokens: result.usedTokens,
          pcm,
        },
        now(),
      ));
    } catch {
      ({ armed, armedAt, pending, usedTokens } = settleAfterTurn(
        { armed, armedAt, pending, usedTokens },
        { kind: "failed" },
        now(),
      ));
      lamp.set("idle");
    }
  }
}

async function main(): Promise<void> {
  const args = parseRadioArgs(process.argv.slice(2));
  const config = loadRuntimeConfig(args.audioDevice);
  const voice = await startVoice();
  const startup = liveStartupLine(args.liveChoice, process.env.RADIO_DAYS_API_KEY);
  if (startup !== null) process.stderr.write(`${startup}\n`);
  const ledgerRoot = resolve("data");
  const opened = openLedger(ledgerRoot);
  const ledger = opened.ledger;
  const micBytes = { received: 0 };
  process.stderr.write(`${SV.listeningForWake}\n`);

  const mic = spawn("arecord", captureArgs(config.audioDevice), {
    stdio: ["ignore", "pipe", "pipe"],
    env: envForLocalModels(process.env),
  });
  let microphoneClosed = false;
  const endMicrophone = (): void => {
    if (microphoneClosed) return;
    microphoneClosed = true;
    const closed = closeRadio(voice.stop);
    process.stderr.write(`${closed.line}\n`);
    process.exitCode = closed.exitCode;
  };
  watchMicrophone(mic, endMicrophone);
  if (mic.stdout === null) {
    endMicrophone();
    return;
  }

  await runRadioLoop({
    frames: framesFrom(mic.stdout, micBytes),
    micBytes,
    transcribe: (pcm) => voice.transcribe(pcm),
    complete: (command, usedTokens) =>
      replyTo(command, args.liveChoice, config, ledger, ledgerRoot, opened.writable, usedTokens),
    speak: (text) => voice.speak(text),
    play: (audio) => playPcm(config.audioDevice, audio),
    onLatency: (latencyMs) => {
      process.stderr.write(`${latencyMs}\n`);
    },
  });
  endMicrophone();
}

export function closeRadio(stop: () => void): { line: string; exitCode: 1 } {
  stop();
  return { line: SV.audioMissing, exitCode: 1 };
}

function openLedger(root: string): { ledger: Ledger; writable: boolean } {
  try {
    return { ledger: readLedgerFile(root, new Date()), writable: true };
  } catch {
    return {
      ledger: { month: stockholmMonth(new Date()), spentOre: CAP_ORE },
      writable: false,
    };
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
  writable: boolean,
  usedTokens: number,
): Promise<{ text: string; calledModel: boolean; usedTokens: number }> {
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
    onLedger: (next) => {
      ledger.month = next.month;
      ledger.spentOre = next.spentOre;
      if (writable) writeLedgerFile(ledgerRoot, ledger);
    },
  });
  return { text: result.text, calledModel: result.calledModel, usedTokens: result.usedTokens };
}

function readOptionalInt(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function startVoice(): Promise<{
  stop(): void;
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
    stop(): void {
      child.kill();
    },
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

async function* framesFrom(
  stream: NodeJS.ReadableStream,
  micBytes: { received: number },
): AsyncGenerator<Buffer> {
  const chunks: Buffer[] = [];
  let ended = false;
  let notify: (() => void) | null = null;
  stream.on("data", (chunk: Buffer) => {
    micBytes.received += chunk.length;
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
    env: envForLocalModels(process.env),
  });
  if (child.stdin === null) throw new Error(SV.audioMissing);
  const stdin = child.stdin;
  const firstByteAt = Date.now();
  const finished = whenPlayerExits(child, stdin);
  try {
    stdin.write(audio.pcm);
    stdin.end();
  } catch {
    // A dead player reports the failure through the close or error event.
  }
  await finished;
  return firstByteAt;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${reportedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
