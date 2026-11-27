import { isSilence } from "./audio.ts";

export const SAMPLE_RATE_HZ = 16_000;
export const BYTES_PER_SECOND = SAMPLE_RATE_HZ * 2;
export const LISTEN_TIMEOUT_MS = 10_000;
export const SILENCE_RMS = 500;
export const WAKE_WINDOW_BYTES = BYTES_PER_SECOND * 2;
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
  const ready = input.armed
    ? isSilence(input.frame, SILENCE_RMS) && input.pending.length > MIN_SPEECH_BYTES
    : input.pending.length >= WAKE_WINDOW_BYTES;
  if (!ready) return "wait";
  if (isSilence(input.pending, SILENCE_RMS)) return "skip-silent";
  return "transcribe";
}

export function overlapTail(pcm: Buffer) {
  const start = Math.max(0, pcm.length - OVERLAP_BYTES);
  const tail = Buffer.alloc(pcm.length - start);
  pcm.copy(tail, 0, start);
  return tail;
}
