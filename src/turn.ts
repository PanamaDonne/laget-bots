import { Lamp } from "./lamp.ts";
import { armAfterHeard, overlapTail } from "./listen.ts";
import { SV } from "./swedish.ts";
import { hear } from "./wake.ts";

export type Reply = {
  text: string;
  calledModel: boolean;
  usedTokens?: number;
};

export type HeardInput = {
  text: string;
  playbackActive: boolean;
  pushToTalk: boolean;
  armed: boolean;
  speechEndedAt: number;
  lamp: Lamp;
  complete: (command: string) => Promise<Reply>;
  speak: (text: string) => Promise<{ firstByteAt: number }>;
};

export type HeardResult = {
  armed: boolean;
  spoke: boolean;
  reply: string | null;
  latencyMs: number | null;
  usedTokens: number | null;
  lamp: Lamp;
};

export type ListenFields = {
  armed: boolean;
  armedAt: number | null;
  pending: Buffer;
  usedTokens: number;
};

export type TurnSettlement =
  | {
      kind: "reply";
      spoke: boolean;
      heardArmed: boolean;
      reportedTokens: number | null;
      pcm: Buffer;
    }
  | { kind: "failed" }
  | { kind: "timeout" };

function usageAfterTurn(current: number, reported: number | null, backToIdle: boolean): number {
  if (backToIdle) return 0;
  if (reported === null) return current;
  return reported;
}

export function settleAfterTurn(state: ListenFields, outcome: TurnSettlement, now: number): ListenFields {
  if (outcome.kind === "failed" || outcome.kind === "timeout") {
    return {
      armed: false,
      armedAt: null,
      pending: Buffer.alloc(0),
      usedTokens: usageAfterTurn(state.usedTokens, null, true),
    };
  }
  if (outcome.kind === "reply") {
    const armed = armAfterHeard({ heardArmed: outcome.heardArmed, spoke: outcome.spoke });
    const keepTail = !outcome.spoke && !outcome.heardArmed;
    return {
      armed,
      armedAt: armed ? (state.armed ? state.armedAt : now) : null,
      pending: keepTail ? overlapTail(outcome.pcm) : Buffer.alloc(0),
      usedTokens: usageAfterTurn(state.usedTokens, outcome.reportedTokens, !armed),
    };
  }
  const unreachable: never = outcome;
  return unreachable;
}

export async function handleHeard(input: HeardInput): Promise<HeardResult> {
  const quiet = {
    armed: input.armed,
    spoke: false,
    reply: null,
    latencyMs: null,
    usedTokens: null,
    lamp: input.lamp,
  };
  if (input.playbackActive) {
    return quiet;
  }

  const heard = hear({ text: input.text, playbackActive: false });
  const command = heard.woke
    ? heard.command
    : input.pushToTalk || input.armed
      ? input.text.trim()
      : null;
  if (command === null) {
    return { ...quiet, armed: false };
  }

  if (command.length === 0) {
    input.lamp.set("listening");
    return { ...quiet, armed: true };
  }

  input.lamp.set("thinking");
  try {
    const completed = await input.complete(command);
    const spoken = await input.speak(completed.text);
    input.lamp.set("idle");
    return {
      armed: false,
      spoke: true,
      reply: completed.text,
      latencyMs: spoken.firstByteAt - input.speechEndedAt,
      usedTokens: completed.usedTokens ?? null,
      lamp: input.lamp,
    };
  } catch {
    return sayFailure(input);
  }
}

async function sayFailure(input: HeardInput): Promise<HeardResult> {
  try {
    const spoken = await input.speak(SV.failed);
    input.lamp.set("idle");
    return {
      armed: false,
      spoke: true,
      reply: SV.failed,
      latencyMs: spoken.firstByteAt - input.speechEndedAt,
      usedTokens: null,
      lamp: input.lamp,
    };
  } catch {
    input.lamp.set("idle");
    return {
      armed: false,
      spoke: false,
      reply: SV.failed,
      latencyMs: null,
      usedTokens: null,
      lamp: input.lamp,
    };
  }
}
