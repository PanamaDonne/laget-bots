import assert from "node:assert/strict";
import test from "node:test";

import { scrubError, scrubSecrets } from "../src/secrets.ts";

const KEY = "fake-key";
const USER = "MARKER-USER-TEXT";

function dump(error: Error): string {
  const parts = [error.name, error.message, error.stack ?? ""];
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    parts.push(cause.message, cause.stack ?? "");
    cause = cause.cause;
  }
  return parts.join("\n");
}

test("scrubbing removes the raw secret and its trimmed form", () => {
  const raw = ` ${KEY} `;
  const text = `before ${raw} middle ${KEY} after`;

  const scrubbed = scrubSecrets(text, [raw]);

  assert.equal(scrubbed.includes(KEY), false);
  assert.equal(scrubbed.includes(raw), false);
  assert.match(scrubbed, /\[REDACTED\]/);
});

test("a provider failure becomes fixed text with the key and user text removed", () => {
  const cause = new Error(`cause ${KEY} ${USER}`);
  const error = new Error(`top ${KEY} ${USER}`);
  error.cause = cause;

  const scrubbed = scrubError(error, [` ${KEY} `], "Samtalet kunde inte genomföras.");
  const dumped = dump(scrubbed);

  assert.equal(scrubbed.message, "Samtalet kunde inte genomföras.");
  assert.equal(dumped.includes(KEY), false);
  assert.equal(dumped.includes(USER), false);
  assert.equal(dump(cause).includes(KEY), true);
});
