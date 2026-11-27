export const WHISPER_BASE = "KBLab/kb-whisper-base";
export const WHISPER_TINY = "KBLab/kb-whisper-tiny";
export const LATENCY_GATE_MS = 3_000;

export type LatencyMeasurement = {
  source: "pi4" | "precheck";
  latencyMs: number;
};

export function whisperModelForMeasurement(measurement: LatencyMeasurement | null): string {
  if (measurement === null || measurement.source === "precheck") {
    return WHISPER_BASE;
  }
  if (measurement.source === "pi4") {
    return measurement.latencyMs > LATENCY_GATE_MS ? WHISPER_TINY : WHISPER_BASE;
  }
  const unreachable: never = measurement.source;
  return unreachable;
}
