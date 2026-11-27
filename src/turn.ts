import { Lamp } from "./lamp.ts";
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

export function usageAfterTurn(current: number, reported: number | null, backToIdle: boolean): number {
  if (backToIdle) return 0;
  if (reported === null) return current;
  return reported;
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
