export type LampState = "idle" | "listening" | "thinking" | "waiting";

export type ButtonEffect = "push-to-talk" | "ignored" | "approval-unused";

export class Lamp {
  state: LampState = "idle";
  readonly history: LampState[] = ["idle"];

  set(state: LampState): void {
    this.state = state;
    this.history.push(state);
  }
}

export function pressButton(state: LampState): { effect: ButtonEffect; ranOutsideAction: boolean } {
  switch (state) {
    case "idle":
    case "listening":
      return { effect: "push-to-talk", ranOutsideAction: false };
    case "thinking":
      return { effect: "ignored", ranOutsideAction: false };
    case "waiting":
      return { effect: "approval-unused", ranOutsideAction: false };
    default: {
      const unreachable: never = state;
      throw new Error(unreachable);
    }
  }
}
