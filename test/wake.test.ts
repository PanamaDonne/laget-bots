import assert from "node:assert/strict";
import test from "node:test";

import { ORDINARY_ROOM_SPEECH, WAKE_PHRASE, hear, measureFalseAlarms } from "../src/wake.ts";

test("Kör Radio at the start wakes and keeps the Swedish command", () => {
  const heard = hear({ text: "Kör Radio, vad är klockan", playbackActive: false });

  assert.equal(heard.woke, true);
  assert.equal(heard.command, "vad är klockan");
  assert.equal(heard.ignoredBecausePlayback, false);
});

test("a near miss from speech recognition still wakes", () => {
  assert.equal(WAKE_PHRASE, "Kör Radio");
  for (const text of [
    "Kör radig och vad är klockan?",
    "Kör radigo",
    "Körradiv",
    "Kör radibo",
    "kor radio vad blir det för väder imorgon i Stockholm",
  ]) {
    const heard = hear({ text, playbackActive: false });
    assert.equal(heard.woke, true, text);
  }
  const command = hear({
    text: "Kör radig och vad är klockan?",
    playbackActive: false,
  });
  assert.equal(command.command.includes("klockan"), true);
});

test("the wake phrase alone wakes and waits for speech", () => {
  const heard = hear({ text: "  kör radio  ", playbackActive: false });

  assert.equal(heard.woke, true);
  assert.equal(heard.command, "");
});

test("punctuation between Kör and radio still wakes", () => {
  for (const text of ["Kör, radio!", "KÖR, RADIO!", "Kör. radio?"]) {
    const heard = hear({ text, playbackActive: false });
    assert.equal(heard.woke, true, text);
    assert.equal(heard.command, "", text);
  }
});

test("everyday radio words and a hyphenated compound do not wake or send a command", () => {
  for (const text of [
    "kör radio-appen",
    "Kör Radio-appen!",
    "KÖR RADIO-APPEN",
    "Kör radios",
    "Kör radiot",
    "Kör radie",
    "KÖR RADION",
    "kör radion.",
    "Kör radion, vad är klockan",
    "kör radi0",
    "kör radio0",
    "Kör radi0",
  ]) {
    const heard = hear({ text, playbackActive: false });
    assert.equal(heard.woke, false, text);
    assert.equal(heard.command, "", text);
  }
});

test("radio, kör, and a phrase in the middle do not wake", () => {
  for (const text of [
    "radio",
    "Kör",
    "Jag lyssnar på radio",
    "Jag kör radio ikväll",
    "kör radioaktiv",
    "Kör radiosändning",
    "Kör radion högre",
    "Kör radion klockan åtta",
  ]) {
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
