import { WHISPER_BASE } from "./models.ts";

export type PrecheckReport = {
  kind: "radio-days-precheck";
  countsAsThreeSecondGate: false;
  gateOwner: "PAN-300";
  requestedCpus: 4;
  requestedMemoryMb: 2048;
  enforcedCpus: number | null;
  enforcedMemoryMb: number | null;
  latencyMs: number;
  ordinarySpeechFalseAlarms: number;
  ordinarySpeechChecked: number;
  modelsRan: boolean;
  whisperModel: typeof WHISPER_BASE;
  latencyKind: "orchestration" | "end-to-end";
};

export function buildPrecheckReport(input: {
  latencyMs: number;
  falseAlarms: number;
  checked: number;
  modelsRan: boolean;
  enforcedCpus: number | null;
  enforcedMemoryMb: number | null;
}): PrecheckReport {
  return {
    kind: "radio-days-precheck",
    countsAsThreeSecondGate: false,
    gateOwner: "PAN-300",
    requestedCpus: 4,
    requestedMemoryMb: 2048,
    enforcedCpus: input.enforcedCpus,
    enforcedMemoryMb: input.enforcedMemoryMb,
    latencyMs: input.latencyMs,
    ordinarySpeechFalseAlarms: input.falseAlarms,
    ordinarySpeechChecked: input.checked,
    modelsRan: input.modelsRan,
    whisperModel: WHISPER_BASE,
    latencyKind: input.modelsRan ? "end-to-end" : "orchestration",
  };
}
