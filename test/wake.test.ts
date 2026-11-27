import assert from "node:assert/strict";
import test from "node:test";

import { ORDINARY_ROOM_SPEECH, hear, measureFalseAlarms } from "../src/wake.ts";

test("Kör Radio at the start wakes and keeps the Swedish command", () => {
  const heard = hear({ text: "Kör Radio, vad är klockan", playbackActive: false });

  assert.equal(heard.woke, true);
  assert.equal(heard.command, "vad är klockan");
  assert.equal(heard.ignoredBecausePlayback, false);
});

test("the wake phrase alone wakes and waits for speech", () => {
  const heard = hear({ text: "  kör radio  ", playbackActive: false });

  assert.equal(heard.woke, true);
  assert.equal(heard.command, "");
});

test("radio, kör, and a phrase in the middle do not wake", () => {
  for (const text of ["radio", "Kör", "Jag lyssnar på radio", "Jag kör radio ikväll"]) {
    const heard = hear({ text, playbackActive: false });
    assert.equal(heard.woke, false, text);
    assert.equal(heard.command, "");
  }
});

test("Kör Radio in the radio's own playback does not wake", () => {
  for (const text of ["Kör Radio", "radio", "Kör Radio, jag lyssnar"]) {
    const heard = hear({ text, playbackActive: true });
    assert.equal(heard.woke, false, text);
    assert.equal(heard.ignoredBecausePlayback, true, text);
  }
});

test("ordinary room speech has no false wake", () => {
  const report = measureFalseAlarms(ORDINARY_ROOM_SPEECH);

  assert.equal(report.falseAlarms, 0);
  assert.equal(report.checked, ORDINARY_ROOM_SPEECH.length);
  assert.ok(report.checked >= 8);
});
