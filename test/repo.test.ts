import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

function readText(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readText(path)) as unknown;
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to >= from, `missing ${end}`);
  return text.slice(from, to);
}

function headingIndex(text: string, title: string): number {
  const line = text.split("\n").find((entry) => /^#{1,3} /.test(entry) && entry.includes(title));
  assert.ok(line, `missing heading ${title}`);
  return text.indexOf(line);
}

function section(text: string, title: string, nextTitle: string): string {
  const from = headingIndex(text, title);
  const to = headingIndex(text, nextTitle);
  assert.ok(to > from, `${title} before ${nextTitle}`);
  return text.slice(from, to);
}

const sekCap = /(?<![\d.])99 SEK/;

function says(text: string, sentence: string): void {
  assert.equal(text.includes(sentence), true, sentence);
}

function repoFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      found.push(...repoFiles(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

test("package scripts expose typecheck, lint, test, and check", () => {
  const pkg = readJson("package.json") as {
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts?.lint, "eslint .");
  assert.equal(
    pkg.scripts?.test,
    'node --experimental-strip-types --test "test/**/*.test.ts"',
  );
  assert.equal(pkg.scripts?.check, "npm run typecheck && npm run lint && npm run test");
});

test("TypeScript is strict and includes src and tests", () => {
  const tsconfig = readJson("tsconfig.json") as {
    compilerOptions?: { strict?: boolean; noEmit?: boolean };
    include?: string[];
  };

  assert.equal(tsconfig.compilerOptions?.strict, true);
  assert.equal(tsconfig.compilerOptions?.noEmit, true);
  assert.ok(tsconfig.include?.includes("src/**/*.ts"));
  assert.ok(tsconfig.include?.includes("test/**/*.ts"));
});

test("AGENTS.md names the check commands and stays short", () => {
  const agents = readText("AGENTS.md");
  const lineCount = agents.split("\n").length;

  assert.match(agents, /npm run typecheck/);
  assert.match(agents, /npm run lint/);
  assert.match(agents, /npm run test/);
  assert.match(agents, /node --experimental-strip-types --test test\/repo\.test\.ts/);
  assert.ok(lineCount < 200, `AGENTS.md is ${lineCount} lines`);
});

test("CI runs typecheck, lint, and tests on pull requests", () => {
  const ci = readText(".github/workflows/ci.yml");

  assert.match(ci, /pull_request:/);
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm run lint/);
  assert.match(ci, /npm run test/);
});

test("CI scans for secrets and vulnerable dependencies", () => {
  const ci = readText(".github/workflows/ci.yml");

  assert.match(ci, /gitleaks detect --source \. --redact --exit-code 1/);
  assert.match(ci, /npm audit/);
});

test("SPEC.md is the Radio Days v2.1 product spec", () => {
  const spec = readText("SPEC.md");
  const title = spec.split("\n", 1)[0] ?? "";
  const preamble = spec.split("\n## ")[0] ?? "";

  assert.match(title, /Radio Days/);
  assert.match(title, /v2\.1/);
  assert.match(preamble, /v2\.1/);
  assert.match(preamble, /English by default in v1/);
  assert.match(spec, /PanamaDonne\/radio-days/);
});

test("SPEC.md records the local English voice chain", () => {
  const spec = readText("SPEC.md");
  const voice = section(spec, "Architecture", "The agent, memory");
  const cost = section(spec, "Running cost", "Plan");

  for (const fact of [
    "Whisper",
    "Parakeet",
    "English",
    "Qwen 2.5 7B",
    "Llama 3.1 8B",
    "Piper",
    "Kokoro",
    "fallback",
  ]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }
  assert.match(cost, sekCap);
  for (const fact of ["Piper", "Kokoro"]) {
    assert.equal(cost.includes(fact), true, `cost missing ${fact}`);
  }
});

test("SPEC.md targets an ESP32-S3 thin client and a local Mac mini", () => {
  const spec = readText("SPEC.md");
  const what = section(spec, "What it is", "Scope");
  const hardware = section(spec, "Hardware", "Architecture");
  const voice = section(spec, "Architecture", "The agent, memory");
  const cost = section(spec, "Running cost", "Plan");

  for (const fact of ["ESP32-S3", "Mac mini", "English", "Hey Jarvis", "500 SEK", "cassette"]) {
    assert.equal(what.includes(fact), true, `intro missing ${fact}`);
  }

  for (const fact of ["ESP32-S3", "Mac mini", "500 SEK", "cassette", "16 GB"]) {
    assert.equal(hardware.includes(fact), true, `hardware missing ${fact}`);
  }

  for (const fact of ["Whisper", "Parakeet", "English", "Piper", "Kokoro", "Postgres", "pgvector"]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }

  assert.match(cost, sekCap);
  assert.equal(cost.includes("Mac mini"), true);
});

test("SPEC.md describes an agent that learns habits and acts on its own", () => {
  const spec = readText("SPEC.md");
  const what = section(spec, "What it is", "Scope");
  const behaviour = section(spec, "The agent, memory", "Web admin");
  const v1Scope = section(spec, "In scope for v1", "Out of scope");
  const later = section(spec, "Out of scope", "What changes");
  const latency = section(spec, "Latency", "Running cost");
  const cost = section(spec, "Running cost", "Plan");
  const milestone1 = between(spec, "**Milestone 1:", "**Milestone 2:");
  const milestone4 = between(spec, "**Milestone 4:", "**Milestone 5:");
  const milestone6 = between(spec, "**Milestone 6:", "**v2");

  for (const title of [
    "The agent, memory and proactive jobs",
    "Web admin",
    "Running cost",
    "Latency",
    "Measurement, not an open product decision",
  ]) {
    assert.ok(headingIndex(spec, title) >= 0, title);
  }

  for (const fact of ["Hey Jarvis", "English", "Mac mini"]) {
    assert.equal(what.includes(fact), true, `intro missing ${fact}`);
  }

  for (const fact of [
    "habits",
    "confident enough",
    "unsure",
    "agrees",
    "Raw audio",
    "transcript",
    "Quiet hours",
    "Postgres",
  ]) {
    assert.equal(behaviour.includes(fact), true, `behaviour missing ${fact}`);
  }

  for (const fact of ["Hey Jarvis", "English", "calendar", "web search", "PAN-301"]) {
    assert.equal(v1Scope.includes(fact), true, `v1 scope missing ${fact}`);
  }
  for (const fact of ["Spotify", "III.3", "written permission", "Email", "Swedish", "KB-Whisper"]) {
    assert.equal(later.includes(fact), true, `later missing ${fact}`);
  }

  for (const fact of ["Hey Jarvis", "Whisper", "Parakeet", "English", "Kokoro"]) {
    assert.equal(milestone1.includes(fact), true, `milestone 1 missing ${fact}`);
  }
  for (const fact of ["English", "untrusted", "web radio"]) {
    assert.equal(milestone4.includes(fact), true, `milestone 4 missing ${fact}`);
  }
  for (const fact of ["English", "3 second", "16 GB"]) {
    assert.equal(milestone6.includes(fact), true, `milestone 6 missing ${fact}`);
  }

  for (const fact of ["3 seconds", "PAN-300", "first audio", "not in CI", "English"]) {
    assert.equal(latency.includes(fact), true, `latency missing ${fact}`);
  }

  assert.match(cost, sekCap);
  assert.equal(cost.includes("locked"), true);
});

test("SPEC.md safety limits fail when a locked fact changes", () => {
  const spec = readText("SPEC.md");
  const scope = section(spec, "Scope", "What changes");
  const later = section(spec, "Out of scope", "What changes");
  const changes = section(spec, "What changes", "Hardware");
  const quiet = between(scope, "**Quiet hours and the unprompted cap", "Mail text");
  const hardware = section(spec, "Hardware", "Architecture");
  const voice = section(spec, "Architecture", "The agent, memory");
  const agent = section(spec, "The agent, memory", "Web admin");
  const admin = section(spec, "Web admin", "Privacy");
  const privacy = section(spec, "Privacy, security and providers", "Latency");
  const cost = section(spec, "Running cost", "Plan");
  const impact = section(spec, "Impact on in-flight work", "Measurement");
  const pan312 = between(impact, "PAN-312", "PAN-313");
  const unprompted =
    "Unprompted means anything the radio says on its own initiative that the user did not ask for: proactive suggestions from memory and any self-initiated tips.";
  const quietHours =
    "These count toward the max of 3 per day, and none may be spoken in quiet hours 22:00\u201307:00 Europe/Stockholm.";
  const notCounted =
    "These do not count, because the user asked for them: the morning broadcast and evening summary the user has scheduled, reminders the user created, and watch alerts the user set up (\u201ctell me when \u2026\u201d).";
  const held =
    "User-requested reminders and watch alerts are also held during quiet hours, unless the user marked them urgent in the admin.";
  const berget =
    "Berget may be used for conversation only, with no email, calendar, search or memory content, until a DPA exists.";
  const otherProviders =
    "Every other cloud provider needs a DPA and an EU region before first use.";

  says(quiet, unprompted);
  says(quiet, quietHours);
  says(quiet, notCounted);
  says(quiet, held);
  says(pan312, unprompted);
  says(pan312, quietHours);
  says(pan312, notCounted);
  says(pan312, held);
  says(later, "English is the v1 default.");
  says(changes, "English is the default language.");
  says(admin, "User-facing admin text is English in v1.");
  says(hardware, "The radio is an ESP32-S3 used as a thin client.");
  says(hardware, "Automatic cloud fallback is off by default.");
  says(admin, "Automatic cloud fallback is off by default.");
  says(admin, "CSRF protection applies to every state-changing request.");
  says(admin, "Sign-in without that proof is refused.");
  says(voice, "Both ends authenticate with that key.");
  says(voice, "Re-pairing from the admin rotates the key and revokes the old key.");
  says(privacy, "Memory and secrets are encrypted at rest on the Mac mini.");
  says(privacy, "Logs must not contain raw audio, transcripts, prompts, user text, or secrets.");
  says(privacy, "The radio starts a station only from the user\u2019s saved favourites or a curated allowlist of stream URLs, never from a URL taken from search results or other untrusted text.");
  says(privacy, "Email is not in v1.");
  says(agent, berget);
  says(agent, otherProviders);
  says(privacy, berget);
  says(privacy, otherProviders);
  says(cost, "99 SEK per month including 25 % VAT.");
  says(cost, "It resets at the start of each calendar month in Europe/Stockholm.");
});

test("README and AGENTS.md describe Radio Days and point at SPEC.md", () => {
  const readme = readText("README.md");
  const agents = readText("AGENTS.md");

  assert.match(readme, /Radio Days/);
  assert.match(readme, /\[SPEC\.md\]\(SPEC\.md\)/);
  assert.match(readme, /vanor/);
  assert.match(readme, /på egen hand/);
  assert.match(readme, /ESP32-S3/);
  assert.match(readme, /Mac mini/);
  assert.match(readme, /v2\.1/);
  assert.match(readme, /English/);
  assert.match(agents, /ESP32-S3/);
  assert.match(agents, /Mac mini/);
  assert.match(agents, /English/);
  assert.match(agents, /Radio Days/);
  assert.match(agents, /SPEC\.md/);
  assert.match(agents, /v2\.1/);
  assert.match(agents, /A doc test for a number or limit must match with a boundary/);
  assert.match(agents, sekCap);
  assert.match(agents, /Vera/);
  assert.match(agents, /Lazek/);
  assert.match(agents, /sync-skills/);
  assert.match(agents, /Linear/);
  assert.match(agents, /habits/);
  assert.match(agents, /on its own/);
  assert.match(agents, /token cap/);
  assert.match(agents, /key facts/);
});

test("repo files do not use the retired team-engine name prefix", () => {
  const retiredPrefix = ["laget", "-"].join("");
  const hits = repoFiles(fileURLToPath(root)).filter((file) =>
    readFileSync(file, "utf8").includes(retiredPrefix),
  );
  assert.deepEqual(hits, []);
});

test("the team engine command, config, and sources are gone", () => {
  const pkg = readJson("package.json") as {
    name?: string;
    description?: string;
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.name, "radio-days");
  assert.equal(pkg.scripts?.team, undefined);
  assert.equal(pkg.description?.includes("team of agents"), false);
  for (const path of [
    "example-team.json",
    "src/team-cli.ts",
    "src/team-run.ts",
    "src/team.ts",
    "src/providers.ts",
    "src/runner.ts",
    "src/handoff.ts",
    "src/roles.ts",
    "src/client.ts",
    "src/budget.ts",
    "src/context.ts",
    "src/index.ts",
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  }
});
