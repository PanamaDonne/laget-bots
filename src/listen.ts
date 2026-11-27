import { isSilence } from "./audio.ts";

export const SAMPLE_RATE_HZ = 16_000;
export const BYTES_PER_SECOND = SAMPLE_RATE_HZ * 2;
export const LISTEN_TIMEOUT_MS = 10_000;
export const SILENCE_RMS = 500;
export const WAKE_WINDOW_BYTES = BYTES_PER_SECOND * 2;
export const MAX_UTTERANCE_BYTES = BYTES_PER_SECOND * 15;
export const MIN_SPEECH_BYTES = BYTES_PER_SECOND;
export const OVERLAP_BYTES = BYTES_PER_SECOND;

export type ListenDecision = "wait" | "disarm" | "skip-silent" | "transcribe";

export function decideListen(input: {
  armed: boolean;
  armedAt: number | null;
  now: number;
  pending: Buffer;
  frame: Buffer;
}): ListenDecision {
  if (
    input.armed &&
    input.armedAt !== null &&
    input.now - input.armedAt >= LISTEN_TIMEOUT_MS
  ) {
    return "disarm";
  }
  const ready =
    input.pending.length >= MAX_UTTERANCE_BYTES ||
    (isSilence(input.frame, SILENCE_RMS) && input.pending.length > MIN_SPEECH_BYTES);
  if (!ready) return "wait";
  if (isSilence(input.pending, SILENCE_RMS)) return "skip-silent";
  return "transcribe";
}

export function armAfterHeard(input: { heardArmed: boolean; spoke: boolean }): boolean {
  if (input.spoke) return false;
  return input.heardArmed;
}

export function audibleSlice(input: {
  frameStart: number;
  frame: Buffer;
  echoFrom: number;
  echoUntil: number;
}): Buffer | null {
  if (input.echoUntil <= input.echoFrom || input.frame.length === 0) return input.frame;
  const frameEnd = input.frameStart + input.frame.length;
  if (frameEnd <= input.echoFrom || input.frameStart >= input.echoUntil) return input.frame;
  if (input.frameStart >= input.echoFrom && frameEnd <= input.echoUntil) return null;
  const kept: Buffer[] = [];
  if (input.frameStart < input.echoFrom) {
    kept.push(input.frame.subarray(0, input.echoFrom - input.frameStart));
  }
  if (frameEnd > input.echoUntil) {
    kept.push(input.frame.subarray(input.echoUntil - input.frameStart));
  }
  if (kept.length === 0) return null;
  return kept.length === 1 ? (kept[0] ?? null) : Buffer.concat(kept);
}

export function overlapTail(pcm: Buffer) {
  const start = Math.max(0, pcm.length - OVERLAP_BYTES);
  const tail = Buffer.alloc(pcm.length - start);
  pcm.copy(tail, 0, start);
  return tail;
}
