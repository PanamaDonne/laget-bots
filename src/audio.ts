import type { EventEmitter } from "node:events";

import { SV } from "./swedish.ts";

export function ignoreStreamError(stream: EventEmitter): void {
  stream.on("error", () => undefined);
}

export function captureArgs(device: string): string[] {
  assertDevice(device);
  return ["-D", device, "-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "raw", "-q"];
}

export function playbackArgs(device: string, sampleRate: number): string[] {
  assertDevice(device);
  return ["-D", device, "-f", "S16_LE", "-r", String(sampleRate), "-c", "1", "-t", "raw", "-q"];
}

export function rms(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const sample = pcm.readInt16LE(index * 2);
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

export function isSilence(pcm: Buffer, threshold: number): boolean {
  return rms(pcm) < threshold;
}

function assertDevice(device: string): void {
  if (device.length === 0 || device.includes("\0") || /[\r\n]/.test(device)) {
    throw new Error(SV.invalidDevice);
  }
}
