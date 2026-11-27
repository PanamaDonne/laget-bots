export const WAKE_PATTERN = /^\s*k[öo]r\s+radio\b[\s,.:;!?]*/i;

export const ORDINARY_ROOM_SPEECH = [
  "kan du skicka saltet",
  "vad är klockan",
  "radio",
  "jag lyssnar på radio",
  "kör försiktigt",
  "det var en bra låt",
  "ska vi fika",
  "stäng fönstret",
  "jag kör radio ikväll",
] as const;

export type HearResult = {
  woke: boolean;
  command: string;
  ignoredBecausePlayback: boolean;
};

export function hear(input: { text: string; playbackActive: boolean }): HearResult {
  const match = WAKE_PATTERN.exec(input.text);
  const wouldWake = match !== null;
  if (input.playbackActive) {
    const mentionsRadio = wouldWake || /\bradio\b/i.test(input.text);
    return { woke: false, command: "", ignoredBecausePlayback: mentionsRadio };
  }
  if (!wouldWake || match === null) {
    return { woke: false, command: "", ignoredBecausePlayback: false };
  }
  return {
    woke: true,
    command: input.text.slice(match[0].length).trim(),
    ignoredBecausePlayback: false,
  };
}

export function measureFalseAlarms(lines: readonly string[]): { checked: number; falseAlarms: number } {
  let falseAlarms = 0;
  for (const line of lines) {
    if (hear({ text: line, playbackActive: false }).woke) falseAlarms += 1;
  }
  return { checked: lines.length, falseAlarms };
}
