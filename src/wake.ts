export const WAKE_PHRASE = "Kör Radio";
const RADIO = "radio";

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
  "Kör radion högre",
  "Kör radion klockan åtta",
] as const;

export type HearResult = {
  woke: boolean;
  command: string;
  ignoredBecausePlayback: boolean;
};

function fold(word: string): string {
  return word.toLowerCase().replaceAll("ö", "o").replaceAll("ä", "a").replaceAll("å", "a");
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + cost);
      previous = current;
    }
  }
  return row[right.length] ?? 0;
}

function isRadioWord(word: string): boolean {
  const folded = fold(word);
  if (folded === "radion" || folded === "radions") return false;
  return editDistance(folded, RADIO) <= 1;
}

function readWord(text: string, index: number): { word: string; end: number } | null {
  const match = /^\p{L}+/u.exec(text.slice(index));
  if (match?.[0] === undefined) return null;
  return { word: match[0], end: index + match[0].length };
}

function wakeEnd(text: string): number | null {
  const leading = /^\s*/u.exec(text);
  const index = leading?.[0].length ?? 0;
  const first = readWord(text, index);
  if (first === null) return null;
  if (/^k[öo]r+$/iu.test(first.word)) {
    const gap = /^\s+/u.exec(text.slice(first.end));
    if (gap?.[0] === undefined) return null;
    const second = readWord(text, first.end + gap[0].length);
    if (second === null || !isRadioWord(second.word)) return null;
    const tail = /^[\s,.:;!?]*/u.exec(text.slice(second.end));
    return second.end + (tail?.[0].length ?? 0);
  }
  const folded = fold(first.word);
  let glued = false;
  for (let split = 3; split < folded.length; split += 1) {
    const head = folded.slice(0, split);
    if (!/^kor+$/.test(head)) continue;
    if (!isRadioWord(folded.slice(split))) continue;
    glued = true;
    break;
  }
  if (!glued) return null;
  const tail = /^[\s,.:;!?]*/u.exec(text.slice(first.end));
  return first.end + (tail?.[0].length ?? 0);
}

export function hear(input: { text: string; playbackActive: boolean }): HearResult {
  const end = wakeEnd(input.text);
  const wouldWake = end !== null;
  if (input.playbackActive) {
    const mentionsRadio = wouldWake || /\bradio\b/iu.test(input.text);
    return { woke: false, command: "", ignoredBecausePlayback: mentionsRadio };
  }
  if (end === null) {
    return { woke: false, command: "", ignoredBecausePlayback: false };
  }
  return {
    woke: true,
    command: input.text.slice(end).trim(),
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
