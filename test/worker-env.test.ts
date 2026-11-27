import assert from "node:assert/strict";
import test from "node:test";

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
