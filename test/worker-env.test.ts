import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { closeRadio } from "../src/radio-main.ts";
import { SV } from "../src/swedish.ts";
import { envForLocalModels } from "../src/worker-env.ts";

test("the local voice process does not receive the API key", () => {
  const child = envForLocalModels({
    RADIO_DAYS_API_KEY: "fake-key",
    RADIO_DAYS_PROVIDER_BASE_URL: "https://chat.example/v1",
    PATH: "/usr/bin",
  });

  assert.equal(child.RADIO_DAYS_API_KEY, undefined);
  assert.equal(child.RADIO_DAYS_PROVIDER_BASE_URL, undefined);
  assert.equal(child.PATH, "/usr/bin");
  assert.equal(JSON.stringify(child).includes("fake-key"), false);
});

test("every spawned child gets an environment without secrets", () => {
  for (const file of ["src/radio-main.ts", "src/precheck-cli.ts"]) {
    const source = readFileSync(file, "utf8");
    const calls = source.split("spawn(").slice(1);
    assert.equal(calls.length > 0, true, file);
    for (const call of calls) {
      const body = call.slice(0, call.indexOf("});"));
      assert.equal(body.includes("env:"), true, file);
    }
    assert.equal(source.includes("RADIO_DAYS_API_KEY:"), false);
  }
});

test("a closed microphone stops the voice worker and exits", () => {
  let stopped = false;
  const closed = closeRadio(() => {
    stopped = true;
  });

  assert.equal(stopped, true);
  assert.equal(closed.line, SV.audioMissing);
  assert.equal(closed.exitCode, 1);
  const main = readFileSync("src/radio-main.ts", "utf8");
  assert.equal(main.includes("closeRadio(voice.stop)"), true);
  assert.equal(main.includes("mic.on(\"error\", endMicrophone)"), true);
  assert.equal(main.includes("reportedFailure(error)"), true);
  assert.equal(main.includes("stdin.on(\"error\""), true);
  assert.equal(main.includes("audibleSlice"), true);
});
