import assert from "node:assert/strict";
import test from "node:test";

import { Lamp, pressButton } from "../src/lamp.ts";

test("the scale lamp records idle, listening, and thinking", () => {
  const lamp = new Lamp();
  lamp.set("listening");
  lamp.set("thinking");
  lamp.set("idle");

  assert.deepEqual(lamp.history, ["idle", "listening", "thinking", "idle"]);
  assert.equal(lamp.state, "idle");
});

test("the button is push-to-talk until the radio is waiting", () => {
  assert.equal(pressButton("idle").effect, "push-to-talk");
  assert.equal(pressButton("listening").effect, "push-to-talk");
  assert.equal(pressButton("thinking").effect, "ignored");

  const waiting = pressButton("waiting");
  assert.equal(waiting.effect, "approval-unused");
  assert.equal(waiting.ranOutsideAction, false);
});
