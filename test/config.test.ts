import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadConfigFile, resolveConfig, sharedConfig } from "../src/config.ts";

test("the computer and the Pi share every setting except the audio device", () => {
  const desk = resolveConfig("default");
  const pi = resolveConfig("plughw:1,0");

  assert.equal(desk.audioDevice, "default");
  assert.equal(pi.audioDevice, "plughw:1,0");
  assert.equal(desk.whisperModel, sharedConfig.whisperModel);
  assert.equal(pi.whisperModel, sharedConfig.whisperModel);
  assert.equal(desk.piperVoice, "sv_SE-nst-medium");
  assert.equal(pi.piperVoice, desk.piperVoice);
  assert.equal(desk.wakePhrase, "Kör Radio");
  assert.equal(desk.tokenCap, pi.tokenCap);
  assert.equal(JSON.stringify({ ...desk, audioDevice: "" }), JSON.stringify({ ...pi, audioDevice: "" }));
});

test("a config file cannot supply an API key", () => {
  const loaded = loadConfigFile({
    audioDevice: "plughw:1,0",
    apiKey: "fake-key",
    RADIO_DAYS_API_KEY: "fake-key",
  });

  assert.equal(loaded.audioDevice, "plughw:1,0");
  assert.equal(JSON.stringify(loaded).includes("fake-key"), false);
  assert.equal("apiKey" in loaded, false);
});

test("the committed config only names the audio device", () => {
  const file = JSON.parse(readFileSync(new URL("../radio-days.config.json", import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;

  assert.deepEqual(Object.keys(file), ["audioDevice"]);
  assert.equal(file.audioDevice, "default");
});
