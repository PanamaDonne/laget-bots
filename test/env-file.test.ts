import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadProviderEnvFile } from "../src/env-file.ts";
import { runTeamFromFile } from "../src/team-run.ts";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const exampleTeam = join(root, "example-team.json");
const PROVIDER_ENV = ["BERGET_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY", "OPENAI_API_KEY"] as const;
const FILE_KEY = "fake-berget-file-284";
const ENV_KEY = "fake-berget-env-284";
const LOSER_KEY = "fake-berget-file-loses-284";
const OUTSIDE_KEY = "fake-outside-file-284";
const PADDED_KEY = "fake-pad-file-284";
const ENV_READ_ERROR = "Kunde inte läsa .env.";

function authDigest(secret: string): string {
  return createHash("sha256").update(`Bearer ${secret}`).digest("hex");
}

function providerFreeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of PROVIDER_ENV) {
    delete env[key];
  }
  delete env.LAGET_FETCH_LOG;
  delete env.LAGET_FETCH_MODE;
  return env;
}

function hides(output: string, secret: string): void {
  assert.equal(output.includes(secret), false);
}

function writeEnvFile(dir: string, body: string): void {
  writeFileSync(join(dir, ".env"), body);
}

async function withProviderEnv(keys: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  for (const value of Object.values(keys)) {
    if (value !== undefined && value.trim() !== "" && !value.trim().startsWith("fake-")) {
      throw new Error("tester sätter bara fake-nycklar");
    }
  }
  const saved = PROVIDER_ENV.map((key) => [key, process.env[key]] as const);
  for (const key of PROVIDER_ENV) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(keys)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("local .env provider keys", () => {
  test(".env.example lists the provider keys and .env stays gitignored", () => {
    const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
    const example = readFileSync(join(root, ".env.example"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const spec = readFileSync(join(root, "SPEC.md"), "utf8");

    assert.match(gitignore, /(^|\n)\.env(\r?\n|$)/);
    assert.match(gitignore, /(^|\n)!\.env\.example(\r?\n|$)/);
    for (const key of PROVIDER_ENV) {
      assert.match(example, new RegExp(`^${key}=$`, "m"));
    }
    assert.equal(example.includes("fake-"), false);
    assert.equal(example.includes("sk-"), false);
    for (const line of example.split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator === -1) {
        continue;
      }
      assert.equal(line.slice(separator + 1).trim(), "");
    }
    assert.match(readme, /\.env\.example/);
    assert.match(readme, /already set in the environment/);
    assert.match(spec, /local `\.env`/);
    assert.match(spec, /already in the environment wins/);
  });

  test("a missing .env leaves the environment unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const env: NodeJS.ProcessEnv = {};
    try {
      loadProviderEnvFile(dir, env);
      assert.deepEqual(env, {});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a provider key in .env is loaded and unknown keys are not", () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const env: NodeJS.ProcessEnv = {};
    try {
      writeEnvFile(
        dir,
        [
          "\uFEFF# lokal nyckel",
          "",
          "export BERGET_API_KEY=\"fake-berget-file-284\"",
          "MISTRAL_API_KEY='fake-mistral-file-284'",
          "XAI_API_KEY=fake-xai-file-284",
          "OPENAI_API_KEY=fake-openai-file-284",
          "PATH=/tmp/not-applied",
          "OTHER_SECRET=fake-other-secret-284",
          "BERGET_API_KEY=fake-second-berget-284",
        ].join("\n"),
      );
      loadProviderEnvFile(dir, env);

      assert.equal(env.BERGET_API_KEY, FILE_KEY);
      assert.equal(env.MISTRAL_API_KEY, "fake-mistral-file-284");
      assert.equal(env.XAI_API_KEY, "fake-xai-file-284");
      assert.equal(env.OPENAI_API_KEY, "fake-openai-file-284");
      assert.equal(env.PATH, undefined);
      assert.equal(env.OTHER_SECRET, undefined);
      assert.equal(JSON.stringify(env).includes("fake-second-berget-284"), false);
      assert.equal(JSON.stringify(env).includes("fake-other-secret-284"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a key already in the environment wins over .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const env: NodeJS.ProcessEnv = { BERGET_API_KEY: ENV_KEY, MISTRAL_API_KEY: "" };
    try {
      writeEnvFile(dir, `BERGET_API_KEY=${LOSER_KEY}\nMISTRAL_API_KEY=fake-mistral-file-284\n`);
      loadProviderEnvFile(dir, env);

      assert.equal(env.BERGET_API_KEY, ENV_KEY);
      assert.equal(env.MISTRAL_API_KEY, "");
      assert.equal(JSON.stringify(env).includes(LOSER_KEY), false);
      assert.equal(JSON.stringify(env).includes("fake-mistral-file-284"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a .env symlink outside the directory is refused without echoing the key", () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const outside = mkdtempSync(join(tmpdir(), "laget-outside-"));
    const env: NodeJS.ProcessEnv = {};
    try {
      const target = join(outside, "key.txt");
      writeFileSync(target, `BERGET_API_KEY=${OUTSIDE_KEY}\n`);
      symlinkSync(target, join(dir, ".env"));

      assert.throws(
        () => loadProviderEnvFile(dir, env),
        (error: Error) => {
          assert.equal(error.message, ENV_READ_ERROR);
          hides(error.message, OUTSIDE_KEY);
          hides(error.message, "key.txt");
          return true;
        },
      );
      assert.equal(env.BERGET_API_KEY, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("team run uses a .env key like an environment key", { concurrency: false }, () => {
  test("--live sends the .env key and never prints it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const lines: string[] = [];
    const originalFetch = globalThis.fetch;
    let authMatches = false;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      authMatches = headers.get("authorization") === `Bearer ${FILE_KEY}`;
      return new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      writeEnvFile(dir, `BERGET_API_KEY=${FILE_KEY}\n`);
      const env: NodeJS.ProcessEnv = {};
      loadProviderEnvFile(dir, env);
      await withProviderEnv({ BERGET_API_KEY: env.BERGET_API_KEY }, async () => {
        const result = await runTeamFromFile(exampleTeam, "Bygg en funktion", {
          live: true,
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        assert.equal(authMatches, true);
        assert.equal(result.success, true);
        assert.match(output, /live, Berget/);
        hides(output, FILE_KEY);
        hides(result.error ?? "", FILE_KEY);
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--provider sends the .env key the same way", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const lines: string[] = [];
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), `Bearer ${FILE_KEY}`);
      return new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      writeEnvFile(dir, `BERGET_API_KEY=${FILE_KEY}\n`);
      const env: NodeJS.ProcessEnv = {};
      loadProviderEnvFile(dir, env);
      await withProviderEnv({ BERGET_API_KEY: env.BERGET_API_KEY }, async () => {
        const result = await runTeamFromFile(exampleTeam, "Mål", {
          providerId: "berget",
          write: (line) => lines.push(line),
        });
        assert.equal(calls > 0, true);
        assert.equal(result.success, true);
        hides(lines.join("\n"), FILE_KEY);
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a .env key without --live or --provider makes no call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const lines: string[] = [];
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("ska inte anropas");
    }) as typeof fetch;

    try {
      writeEnvFile(dir, `BERGET_API_KEY=${FILE_KEY}\n`);
      const env: NodeJS.ProcessEnv = {};
      loadProviderEnvFile(dir, env);
      await withProviderEnv({ BERGET_API_KEY: env.BERGET_API_KEY }, async () => {
        const result = await runTeamFromFile(exampleTeam, "Bygg en funktion", {
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        assert.equal(result.success, true);
        assert.equal(calls, 0);
        assert.match(output, /Sätt på riktigt läge med --live eller --provider/);
        assert.equal(output.includes("Leverantör: Berget"), false);
        hides(output, FILE_KEY);
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the environment key is sent when .env holds a different key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const lines: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), `Bearer ${ENV_KEY}`);
      throw new Error(`nekad ${ENV_KEY}`);
    }) as typeof fetch;

    try {
      writeEnvFile(dir, `BERGET_API_KEY=${LOSER_KEY}\n`);
      const env: NodeJS.ProcessEnv = { BERGET_API_KEY: ENV_KEY };
      loadProviderEnvFile(dir, env);
      assert.equal(env.BERGET_API_KEY, ENV_KEY);
      await withProviderEnv({ BERGET_API_KEY: env.BERGET_API_KEY }, async () => {
        const result = await runTeamFromFile(exampleTeam, "Mål", {
          live: true,
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        assert.equal(result.success, false);
        hides(output, ENV_KEY);
        hides(output, LOSER_KEY);
        hides(result.error ?? "", ENV_KEY);
        hides(result.error ?? "", LOSER_KEY);
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a padded .env key is trimmed and stays out of the error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-env-"));
    const lines: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error(`nekad ${PADDED_KEY}`);
    }) as typeof fetch;

    try {
      writeEnvFile(dir, `BERGET_API_KEY="  ${PADDED_KEY}  "\n`);
      const env: NodeJS.ProcessEnv = {};
      loadProviderEnvFile(dir, env);
      assert.equal(env.BERGET_API_KEY, `  ${PADDED_KEY}  `);
      await withProviderEnv({ BERGET_API_KEY: env.BERGET_API_KEY }, async () => {
        const result = await runTeamFromFile(exampleTeam, "Mål", {
          live: true,
          write: (line) => lines.push(line),
        });
        const output = lines.join("\n");

        hides(output, PADDED_KEY);
        hides(output, `  ${PADDED_KEY}  `);
        hides(result.error ?? "", PADDED_KEY);
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("npm run team reads .env from the working directory", { concurrency: false }, () => {
  test("without --live or --provider the file key makes no call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-cli-"));
    const log = join(dir, "fetch.log");
    try {
      writeEnvFile(dir, `BERGET_API_KEY=${FILE_KEY}\n`);
      const result = await runCli(dir, log, "ok", [exampleTeam, "Bygg en funktion"]);
      const output = `${result.stdout}\n${result.stderr}`;

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Sätt på riktigt läge med --live eller --provider/);
      assert.equal(readFileSync(log, "utf8"), "");
      hides(output, FILE_KEY);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--live uses the .env key through mocked fetch and hides it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-cli-"));
    const log = join(dir, "fetch.log");
    try {
      writeEnvFile(dir, `BERGET_API_KEY=${FILE_KEY}\n`);
      const result = await runCli(dir, log, "ok", [exampleTeam, "Bygg en funktion", "--live"]);
      const output = `${result.stdout}\n${result.stderr}`;

      assert.equal(result.code, 0);
      assert.match(result.stdout, /live, Berget/);
      assert.match(readFileSync(log, "utf8"), new RegExp(authDigest(FILE_KEY)));
      hides(output, FILE_KEY);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--provider uses the .env key and an environment key still wins", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-cli-"));
    const log = join(dir, "fetch.log");
    try {
      writeEnvFile(dir, `BERGET_API_KEY=${LOSER_KEY}\n`);
      const env = providerFreeEnv();
      env.BERGET_API_KEY = ENV_KEY;
      const result = await runCli(dir, log, "throw", [exampleTeam, "Mål", "--provider", "berget"], env);
      const output = `${result.stdout}\n${result.stderr}`;

      assert.equal(result.code, 1);
      assert.match(readFileSync(log, "utf8"), new RegExp(authDigest(ENV_KEY)));
      assert.equal(readFileSync(log, "utf8").includes(authDigest(LOSER_KEY)), false);
      hides(output, ENV_KEY);
      hides(output, LOSER_KEY);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a .env symlink outside the repo is a fixed error and makes no call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "laget-cli-"));
    const outside = mkdtempSync(join(tmpdir(), "laget-outside-"));
    const log = join(dir, "fetch.log");
    try {
      writeFileSync(join(outside, "key.txt"), `BERGET_API_KEY=${OUTSIDE_KEY}\n`);
      symlinkSync(join(outside, "key.txt"), join(dir, ".env"));
      const result = await runCli(dir, log, "ok", [exampleTeam, "Mål", "--live"]);
      const output = `${result.stdout}\n${result.stderr}`;

      assert.equal(result.code, 1);
      assert.match(result.stderr, new RegExp(ENV_READ_ERROR));
      assert.equal(readFileSync(log, "utf8"), "");
      hides(output, OUTSIDE_KEY);
      hides(output, "key.txt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

async function runCli(
  cwd: string,
  log: string,
  mode: "ok" | "throw",
  args: readonly string[],
  env: NodeJS.ProcessEnv = providerFreeEnv(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  writeFileSync(log, "");
  const childEnv = { ...env, LAGET_FETCH_LOG: log, LAGET_FETCH_MODE: mode };
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        fileURLToPath(new URL("./block-network.mjs", import.meta.url)),
        join(root, "src/team-cli.ts"),
        ...args,
      ],
      { cwd, env: childEnv },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === "number" ? failed.code : 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}
