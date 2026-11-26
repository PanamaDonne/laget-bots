import type { ConfiguredAgent, ConfiguredTeam } from "./team.ts";
import type { SharedContext } from "./context.ts";
import { addEntry } from "./context.ts";
import { exactRoleLabels, getRole } from "./roles.ts";

export type HandoffType = "work" | "question";

export type HandoffRequest = {
  type: HandoffType;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  requiresResponse: boolean;
};

export type HandoffResult = {
  accepted: boolean;
  targetAgent: ConfiguredAgent | null;
  error?: string;
};

export function createWorkHandoff(
  fromAgentId: string,
  toAgentId: string,
  content: string,
): HandoffRequest {
  return {
    type: "work",
    fromAgentId,
    toAgentId,
    content,
    requiresResponse: false,
  };
}

export function createQuestionHandoff(
  fromAgentId: string,
  toAgentId: string,
  question: string,
): HandoffRequest {
  return {
    type: "question",
    fromAgentId,
    toAgentId,
    content: question,
    requiresResponse: true,
  };
}

export function validateHandoff(
  request: HandoffRequest,
  team: ConfiguredTeam,
): HandoffResult {
  const fromAgent = team.agents.find((a) => a.id === request.fromAgentId);
  if (fromAgent === undefined) {
    return {
      accepted: false,
      targetAgent: null,
      error: `Okänd avsändare: ${request.fromAgentId}`,
    };
  }

  const toAgent = team.agents.find((a) => a.id === request.toAgentId);
  if (toAgent === undefined) {
    return {
      accepted: false,
      targetAgent: null,
      error: `Okänd mottagare: ${request.toAgentId}`,
    };
  }

  if (request.fromAgentId === request.toAgentId) {
    return {
      accepted: false,
      targetAgent: null,
      error: selfTargetError(request.type),
    };
  }

  if (request.content.trim() === "") {
    return {
      accepted: false,
      targetAgent: null,
      error: emptyContentError(request.type),
    };
  }

  return {
    accepted: true,
    targetAgent: toAgent,
  };
}

export function executeHandoff(
  request: HandoffRequest,
  team: ConfiguredTeam,
  context: SharedContext,
): HandoffResult {
  const validation = validateHandoff(request, team);
  if (!validation.accepted) {
    return validation;
  }

  const fromAgent = team.agents.find((a) => a.id === request.fromAgentId);
  if (fromAgent === undefined) {
    return {
      accepted: false,
      targetAgent: null,
      error: `Okänd avsändare: ${request.fromAgentId}`,
    };
  }

  const action = request.type === "question" ? "question" : "handoff";
  addEntry(context, fromAgent.id, fromAgent.roleId, action, request.content);

  return validation;
}

export function recordAnswer(
  fromAgentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  answer: string,
): void {
  const fromAgent = team.agents.find((a) => a.id === fromAgentId);
  if (fromAgent === undefined) {
    throw new Error(`Okänd agent: ${fromAgentId}`);
  }
  addEntry(context, fromAgent.id, fromAgent.roleId, "answer", answer);
}

export function recordWork(
  agentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  workDescription: string,
): void {
  recordAgentEntry(agentId, team, context, "work", workDescription);
}

export function recordDone(
  agentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  summary: string,
): void {
  recordAgentEntry(agentId, team, context, "done", summary);
}

function recordAgentEntry(
  agentId: string,
  team: ConfiguredTeam,
  context: SharedContext,
  action: "work" | "done",
  content: string,
): void {
  const agent = team.agents.find((a) => a.id === agentId);
  if (agent === undefined) {
    throw new Error(`Okänd agent: ${agentId}`);
  }
  addEntry(context, agent.id, agent.roleId, action, content);
}

function selfTargetError(type: HandoffType): string {
  switch (type) {
    case "question":
      return "En agent kan inte fråga sig själv";
    case "work":
      return "En agent kan inte lämna över till sig själv";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function emptyContentError(type: HandoffType): string {
  switch (type) {
    case "question":
      return "Frågan måste ha ett innehåll";
    case "work":
      return "Överlämningen måste ha ett innehåll";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export type ParsedAgentResponse = {
  type: "handoff" | "question" | "done" | "invalid";
  content: string;
  targetAgentId?: string;
  error?: string;
};

const MISSING_MARKER =
  "Svaret saknar markör. Använd [LÄMNAR ÖVER TILL …], [FRÅGAR …] eller [KLART].";

const LOOSE_MARKER =
  "Markören måste stå ensam på en egen rad. Använd [LÄMNAR ÖVER TILL …], [FRÅGAR …] eller [KLART] utan annan text på samma rad.";

const SEVERAL_MARKERS =
  "Svaret har flera markörer. Använd bara en av [LÄMNAR ÖVER TILL …], [FRÅGAR …] eller [KLART].";

type MarkerHit = {
  kind: "handoff" | "question" | "done";
  target: string;
  index: number;
  length: number;
};

export function parseAgentResponse(
  response: string,
  team: ConfiguredTeam,
): ParsedAgentResponse {
  // NFC so NFD å, ä and ö from some tools match the same marker.
  // Do not trim first: a leading indent is what makes an indented code block.
  const normalized = response.normalize("NFC");
  const trimmed = normalized.trim();
  const scanned = scanReply(normalized);
  const hits = scanned.hits;
  const hit = hits[0];
  if (hit === undefined) {
    return {
      type: "invalid",
      content: trimmed,
      error: scanned.loose ? LOOSE_MARKER : MISSING_MARKER,
    };
  }
  if (hits.length > 1) {
    return {
      type: "invalid",
      content: trimmed,
      error: SEVERAL_MARKERS,
    };
  }

  const content = textAroundMarker(normalized, hit);
  if (hit.kind === "done") {
    return {
      type: "done",
      content,
    };
  }
  return parseAddressed(team, hit.kind, hit.target, content);
}

const MARKER_LINE =
  /^(?:\[LÄMNAR ÖVER TILL ([^\]]*)\]|\[FRÅGAR ([^\]]*)\]|\[KLART\])$/iu;

type TextSpan = {
  start: number;
  end: number;
};

type FenceMark = {
  char: "`" | "~";
  size: number;
};

const LOOSE_MARKER_PATTERN = /\[LÄMNAR ÖVER TILL [^\]]*\]|\[FRÅGAR [^\]]*\]|\[KLART\]/giu;

function scanReply(text: string): { hits: MarkerHit[]; loose: boolean } {
  const fences = fenceSpans(text);
  const pres = preSpans(text, fences);
  const inlines = inlineCodeSpans(text, fences);
  const comments = commentSpans(text, [...fences, ...pres, ...inlines]);
  const ignored = [...fences, ...pres, ...inlines, ...comments];
  const hits: MarkerHit[] = [];
  let loose = false;
  for (const line of splitLines(text)) {
    if (isBlockQuote(line.text) || isIndentedCodeLine(line.text)) {
      continue;
    }
    const hit = markerOnLine(line.text, line.start);
    if (hit !== null && !overlapsSpan(hit.index, hit.length, ignored)) {
      hits.push(hit);
      continue;
    }
    if (lineHasLooseMarker(line.text, line.start, ignored)) {
      loose = true;
    }
  }
  return { hits, loose };
}

function splitLines(text: string): Array<{ text: string; start: number }> {
  const lines: Array<{ text: string; start: number }> = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lines.push({ text: text.slice(start, index), start });
      start = index + 1;
    }
  }
  lines.push({ text: text.slice(start), start });
  return lines;
}

function markerOnLine(line: string, lineStart: number): MarkerHit | null {
  const match = MARKER_LINE.exec(line.trim());
  if (match === null) {
    return null;
  }
  const leading = line.length - line.trimStart().length;
  const kind = markerKind(match);
  return {
    kind,
    target: markerTarget(kind, match),
    index: lineStart + leading,
    length: match[0].length,
  };
}

function fenceSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let open: (FenceMark & { start: number }) | null = null;
  for (const line of splitLines(text)) {
    const lineEnd = line.start + line.text.length;
    if (open === null) {
      const fence = openingFence(line.text);
      if (fence !== null) {
        open = { ...fence, start: line.start };
      }
      continue;
    }
    if (closingFence(line.text, open)) {
      spans.push({ start: open.start, end: lineEnd });
      open = null;
    }
  }
  if (open !== null) {
    spans.push({ start: open.start, end: text.length });
  }
  return spans;
}

function openingFence(line: string): FenceMark | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(withoutCarriageReturn(line));
  if (match === null) {
    return null;
  }
  const token = match[2] ?? "";
  const rest = match[3] ?? "";
  const char = fenceChar(token);
  if (char === null || (char === "`" && rest.includes("`"))) {
    return null;
  }
  return { char, size: token.length };
}

function closingFence(line: string, open: FenceMark): boolean {
  const match = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(withoutCarriageReturn(line));
  if (match === null) {
    return false;
  }
  const token = match[2] ?? "";
  const char = fenceChar(token);
  return char === open.char && token.length >= open.size;
}

function fenceChar(token: string): FenceMark["char"] | null {
  const char = token[0];
  if (char === "`" || char === "~") {
    return char;
  }
  return null;
}

function isBlockQuote(line: string): boolean {
  return /^[ \t]{0,3}>/.test(withoutCarriageReturn(line));
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(withoutCarriageReturn(line));
}

function lineHasLooseMarker(line: string, lineStart: number, ignored: readonly TextSpan[]): boolean {
  const raw = withoutCarriageReturn(line);
  LOOSE_MARKER_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(LOOSE_MARKER_PATTERN)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    if (!overlapsSpan(lineStart + index, match[0].length, ignored)) {
      return true;
    }
  }
  return false;
}

function commentSpans(text: string, blocked: readonly TextSpan[]): TextSpan[] {
  const spans: TextSpan[] = [];
  let from = 0;
  while (from < text.length) {
    const block = spanAt(from, blocked);
    if (block !== undefined) {
      from = block.end;
      continue;
    }
    const open = indexOfOutside(text, "<!--", from, blocked);
    if (open === -1) {
      break;
    }
    const close = indexOfOutside(text, "-->", open + 4, blocked);
    if (close === -1) {
      spans.push({ start: open, end: text.length });
      break;
    }
    spans.push({ start: open, end: close + 3 });
    from = close + 3;
  }
  return spans;
}

function indexOfOutside(
  text: string,
  needle: string,
  from: number,
  blocked: readonly TextSpan[],
): number {
  let index = from;
  while (index < text.length) {
    const block = spanAt(index, blocked);
    if (block !== undefined) {
      index = block.end;
      continue;
    }
    const found = text.indexOf(needle, index);
    if (found === -1) {
      return -1;
    }
    const foundBlock = spanAt(found, blocked);
    if (foundBlock === undefined) {
      return found;
    }
    index = foundBlock.end;
  }
  return -1;
}

function preSpans(text: string, fences: readonly TextSpan[]): TextSpan[] {
  const spans: TextSpan[] = [];
  const openPattern = /<pre\b[^>]*>/giu;
  const closePattern = /<\/pre\s*>/giu;
  let from = 0;
  while (from < text.length) {
    const fence = spanAt(from, fences);
    if (fence !== undefined) {
      from = fence.end;
      continue;
    }
    const open = nextMatchOutside(text, openPattern, from, fences);
    if (open === null) {
      break;
    }
    const close = nextMatchOutside(text, closePattern, open.end, fences);
    if (close === null) {
      spans.push({ start: open.start, end: text.length });
      break;
    }
    spans.push({ start: open.start, end: close.end });
    from = close.end;
  }
  return spans;
}

function nextMatchOutside(
  text: string,
  pattern: RegExp,
  from: number,
  fences: readonly TextSpan[],
): { start: number; end: number } | null {
  pattern.lastIndex = from;
  let match = pattern.exec(text);
  while (match !== null) {
    const start = match.index;
    const fence = spanAt(start, fences);
    if (fence === undefined) {
      return { start, end: start + match[0].length };
    }
    pattern.lastIndex = fence.end;
    match = pattern.exec(text);
  }
  return null;
}

function withoutCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function inlineCodeSpans(text: string, fences: readonly TextSpan[]): TextSpan[] {
  const spans: TextSpan[] = [];
  let index = 0;
  while (index < text.length) {
    const fence = spanAt(index, fences);
    if (fence !== undefined) {
      index = fence.end;
      continue;
    }
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let size = 0;
    while (index + size < text.length && text[index + size] === "`") {
      size += 1;
    }
    const closer = findBacktickRun(text, index + size, size, fences);
    if (closer === -1) {
      index += size;
      continue;
    }
    spans.push({ start: index, end: closer + size });
    index = closer + size;
  }
  return spans;
}

function findBacktickRun(
  text: string,
  from: number,
  size: number,
  fences: readonly TextSpan[],
): number {
  let index = from;
  while (index < text.length) {
    const fence = spanAt(index, fences);
    if (fence !== undefined) {
      index = fence.end;
      continue;
    }
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let run = 0;
    while (index + run < text.length && text[index + run] === "`") {
      run += 1;
    }
    if (run === size) {
      return index;
    }
    index += run;
  }
  return -1;
}

function spanAt(index: number, spans: readonly TextSpan[]): TextSpan | undefined {
  return spans.find((span) => index >= span.start && index < span.end);
}

function overlapsSpan(index: number, length: number, spans: readonly TextSpan[]): boolean {
  const end = index + length;
  return spans.some((span) => index < span.end && end > span.start);
}

function markerKind(match: RegExpMatchArray): MarkerHit["kind"] {
  if (match[1] !== undefined) {
    return "handoff";
  }
  if (match[2] !== undefined) {
    return "question";
  }
  return "done";
}

function markerTarget(kind: MarkerHit["kind"], match: RegExpMatchArray): string {
  switch (kind) {
    case "handoff":
      return match[1] ?? "";
    case "question":
      return match[2] ?? "";
    case "done":
      return "";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function textAroundMarker(text: string, hit: MarkerHit): string {
  const before = text.slice(0, hit.index).trim();
  const after = text.slice(hit.index + hit.length).trim();
  if (before === "") {
    return after;
  }
  if (after === "") {
    return before;
  }
  return `${before}\n${after}`;
}

function parseAddressed(
  team: ConfiguredTeam,
  type: "handoff" | "question",
  rawTarget: string,
  rawContent: string,
): ParsedAgentResponse {
  const content = rawContent.trim();
  const match = matchAgent(team, rawTarget);
  if (!match.ok) {
    return {
      type: "invalid",
      content,
      error: match.error,
    };
  }
  return {
    type,
    content,
    targetAgentId: match.agent.id,
  };
}

type AgentMatch =
  | { ok: true; agent: ConfiguredAgent }
  | { ok: false; error: string };

function matchAgent(team: ConfiguredTeam, reference: string): AgentMatch {
  const trimmed = reference.trim();
  if (trimmed === "") {
    return { ok: false, error: "Mottagaren saknas" };
  }

  const key = foldKey(trimmed);
  const hits = team.agents.filter((agent) => agentMatchesReference(agent, key));
  if (hits.length === 0) {
    return { ok: false, error: `Okänd mottagare: ${trimmed}` };
  }
  if (hits.length > 1) {
    return { ok: false, error: `Tvetydig mottagare: ${trimmed}` };
  }

  const agent = hits[0];
  if (agent === undefined) {
    return { ok: false, error: `Okänd mottagare: ${trimmed}` };
  }
  return { ok: true, agent };
}

function foldKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

function agentMatchesReference(agent: ConfiguredAgent, key: string): boolean {
  if (foldKey(agent.id) === key || foldKey(agent.name) === key) {
    return true;
  }
  return exactRoleLabels(agent.roleId).some((label) => foldKey(label) === key);
}

export function formatHandoffInstructions(team: ConfiguredTeam): string {
  const agentList = team.agents
    .map((a) => {
      const role = getRole(a.roleId);
      return `  - ${a.name} (${role.name})`;
    })
    .join("\n");

  return `
När du vill lämna över arbete till en annan agent, använd formatet:
[LÄMNAR ÖVER TILL <agentnamn>]
<beskrivning av vad som ska göras>

När du vill ställa en fråga till en annan agent, använd formatet:
[FRÅGAR <agentnamn>]
<din fråga>

När du är klar med ditt arbete och det inte behöver lämnas vidare, använd formatet:
[KLART]
<sammanfattning av vad du har gjort>

Markören ska stå ensam på en egen rad. Annan text på samma rad räknas inte.

Mottagaren måste matcha id, namn eller roll exakt. En okänd, tom eller tvetydig mottagare är ett fel.

Tillgängliga agenter i teamet:
${agentList}
`.trim();
}
