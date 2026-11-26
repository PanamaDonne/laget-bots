/* global process, Headers, Response */
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

const sink = process.env.LAGET_FETCH_LOG;
if (typeof sink === "string" && sink !== "") {
  const mode = process.env.LAGET_FETCH_MODE === "throw" ? "throw" : "ok";
  const done = JSON.stringify({
    id: "live",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "[KLART]\nGranskningen är godkänd" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 4 },
  });

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    const auth = headers.get("authorization") ?? "";
    appendFileSync(sink, `${createHash("sha256").update(auth).digest("hex")}\n`);
    if (mode === "throw") {
      throw new Error(`nekad ${auth}`);
    }
    return new Response(done, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
