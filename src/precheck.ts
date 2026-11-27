import { WHISPER_BASE } from "./models.ts";

export type PrecheckReport = {
  kind: "radio-days-precheck";
  countsAsThreeSecondGate: false;
  gateOwner: "PAN-300";
  requestedCpus: 4;
  requestedMemoryMb: 2048;
  enforcedCpus: number | null;
  enforcedMemoryMb: number | null;
  latencyMs: number | null;
  ordinarySpeechFalseAlarms: number;
  ordinarySpeechChecked: number;
  modelsRan: boolean;
  whisperModel: typeof WHISPER_BASE;
  latencyKind: "model" | "not-measured";
};

export function buildPrecheckReport(input: {
  latencyMs: number | null;
  falseAlarms: number;
  checked: number;
  modelsRan: boolean;
  enforcedCpus: number | null;
  enforcedMemoryMb: number | null;
}): PrecheckReport {
  const latencyMs = input.modelsRan ? input.latencyMs : null;
  return {
    kind: "radio-days-precheck",
    countsAsThreeSecondGate: false,
    gateOwner: "PAN-300",
    requestedCpus: 4,
    requestedMemoryMb: 2048,
    enforcedCpus: input.enforcedCpus,
    enforcedMemoryMb: input.enforcedMemoryMb,
    latencyMs,
    ordinarySpeechFalseAlarms: input.falseAlarms,
    ordinarySpeechChecked: input.checked,
    modelsRan: latencyMs !== null,
    whisperModel: WHISPER_BASE,
    latencyKind: latencyMs !== null ? "model" : "not-measured",
  };
}
