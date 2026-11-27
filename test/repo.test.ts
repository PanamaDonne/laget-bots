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
  says(
    preamble,
    "Status: proposed. Direction decided by Daniel Hansson 2026-11-27; this spec becomes accepted when Daniel merges this PR.",
  );
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
    "swaps one local model for another",
  ]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }
  says(cost, "Local STT, the local model, local Piper or Kokoro, local Postgres, the local scheduler, the Next.js admin on the Mac mini, and own SearXNG have no hosted fee.");
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

  for (const fact of ["Mac mini", "cassette", "section 4", "section 2.1", "section 2.2"]) {
    assert.equal(what.includes(fact), true, `intro missing ${fact}`);
  }

  says(hardware, "The radio is an ESP32-S3 used as a thin client.");
  says(hardware, "The house backend is Daniel\u2019s Mac mini (Apple M4, 16 GB).");
  says(
    hardware,
    "Radio budget: at most 500 SEK for one working unit, including microphone and speaker.",
  );
  assert.match(hardware, /(?<![\d.])16 GB/);
  assert.match(hardware, /(?<![\d.])500 SEK/);

  for (const fact of ["Whisper", "Parakeet", "English", "Piper", "Kokoro", "Postgres", "pgvector"]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }

  says(cost, "Local STT, the local model, local Piper or Kokoro, local Postgres, the local scheduler, the Next.js admin on the Mac mini, and own SearXNG have no hosted fee.");
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

  for (const fact of ["Mac mini", "section 2.1", "section 2.2"]) {
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

  says(milestone1, "The wake word, the local voice chain, and pairing are the rule in section 2.1 and section 5.");
  for (const fact of ["section 2.2", "untrusted", "web radio", "Station start is the rule in section 8."]) {
    assert.equal(milestone4.includes(fact), true, `milestone 4 missing ${fact}`);
  }
  says(milestone6, "against the gate in section 9.");
  says(milestone6, "fits in the memory in section 4.");
  says(milestone6, "habit consent is the rule in section 6");

  says(
    latency,
    "at most 3 seconds from when the user stops speaking until the first audio on the cassette player\u2019s speaker.",
  );
  assert.match(latency, /(?<![\d.])3 seconds/);
  for (const fact of ["PAN-300", "first audio", "not in CI"]) {
    assert.equal(latency.includes(fact), true, `latency missing ${fact}`);
  }

  says(cost, "Local STT, the local model, local Piper or Kokoro, local Postgres, the local scheduler, the Next.js admin on the Mac mini, and own SearXNG have no hosted fee.");
});

test("SPEC.md safety limits fail when a locked fact changes", () => {
  const spec = readText("SPEC.md");
  const scope = section(spec, "Scope", "What changes");
  const later = section(spec, "Out of scope", "What changes");
  const quiet = between(scope, "**Quiet hours and the unprompted cap", "Mail text");
  const v1Scope = section(spec, "In scope for v1", "Out of scope");
  const preamble = spec.slice(0, headingIndex(spec, "What it is"));
  const what = section(spec, "What it is", "Scope");
  const hardware = section(spec, "Hardware", "Architecture");
  const process = section(spec, "Process", "Impact");
  const voice = section(spec, "Architecture", "The agent, memory");
  const agent = section(spec, "The agent, memory", "Web admin");
  const admin = section(spec, "Web admin", "Privacy");
  const privacy = section(spec, "Privacy, security and providers", "Latency");
  const cost = section(spec, "Running cost", "Plan");
  const latency = section(spec, "Latency", "Running cost");
  const changes = section(spec, "What changes", "Hardware");
  const milestone1 = between(spec, "**Milestone 1:", "**Milestone 2:");
  const milestone2 = between(spec, "**Milestone 2:", "**Milestone 3:");
  const milestone3 = between(spec, "**Milestone 3:", "**Milestone 4:");
  const milestone5 = between(spec, "**Milestone 5:", "**Milestone 6:");
  const milestone6 = between(spec, "**Milestone 6:", "**v2");
  const impact = section(spec, "Impact on in-flight work", "Measurement");
  const measurement = spec.slice(headingIndex(spec, "Measurement"));
  const unprompted =
    "Unprompted means anything the radio says on its own initiative that the user did not ask for: proactive suggestions from memory and any self-initiated tips.";
  const quietHours =
    "These count toward the max of 3 per day, and none may be spoken in quiet hours 22:00\u201307:00 Europe/Stockholm.";
  const notCounted =
    "These do not count, because the user asked for them: the morning broadcast and evening summary the user has scheduled, reminders the user created, and watch alerts the user set up (\u201ctell me when \u2026\u201d).";
  const scheduled =
    "The morning broadcast and the evening summary run at the times the user sets, and the admin refuses times inside 22:00\u201307:00.";
  const wait = "Unprompted announcements wait.";
  const urgent =
    "Urgent is a per-item flag the user sets in the admin, and it is off by default.";
  const held =
    "User-requested reminders and watch alerts are also held during quiet hours, unless the user marked them urgent in the admin.";
  const ownCount =
    "Context-aware reminders and suggestions the radio creates on its own count toward the max of 3 unprompted announcements per day.";
  const userOwn =
    "The user\u2019s own reminders, watches, and scheduled broadcasts do not.";

  says(quiet, unprompted);
  says(quiet, quietHours);
  says(quiet, notCounted);
  says(quiet, scheduled);
  says(quiet, wait);
  says(quiet, urgent);
  says(quiet, held);
  says(quiet, ownCount);
  says(quiet, userOwn);
  assert.match(quiet, /(?<![\d.])3 per day/);
  says(later, "English is the v1 default.");
  says(admin, "User-facing admin text follows the v1 language in section 2.2.");
  says(hardware, "The radio is an ESP32-S3 used as a thin client.");
  says(hardware, "If it is unreachable, the radio says an error out loud.");
  says(admin, "A tailnet ACL limits who can reach the admin port.");
  says(admin, "Sessions are server-side, with expiry and logout.");
  says(admin, "CSRF protection applies to every state-changing request.");
  says(admin, "Sign-in without that proof is refused.");
  says(voice, "Both ends authenticate with that key.");
  says(voice, "Re-pairing from the admin rotates the key and revokes the old key.");
  says(v1Scope, "They are never treated as instructions and can never start an action.");
  says(privacy, "No speech leaves the house.");
  says(privacy, "No speech or audio leaves the house.");
  says(privacy, "v1 makes no calls to any hosted model or speech provider.");
  says(privacy, "The model or speech provider base URL may only point to loopback or the LAN, at a local model server on the Mac mini.");
  says(privacy, "The remote Bearer-key path, the cost ledger, and `--live` are removed in a follow-up code PR.");
  says(privacy, "SearXNG forwards queries to public search engines.");
  says(privacy, "Web radio streams, Google Calendar, weather, news, and Tailscale may leave the house.");
  says(privacy, "Nothing else leaves the house.");
  says(privacy, "Calendar invitations and events, and web search results, are never treated as instructions and can never start an action.");
  says(privacy, "Memory and secrets are encrypted at rest on the Mac mini.");
  says(privacy, "Logs must not contain raw audio, transcripts, prompts, user text, or secrets.");
  says(privacy, "The radio starts a station only from the user\u2019s saved favourites or a curated allowlist of stream URLs, never from a URL taken from search results or other untrusted text.");
  says(agent, "v1 runs only local models on the Mac mini.");
  says(voice, "The provider interface swaps one local model for another.");
  says(v1Scope, "SearXNG is not a model.");
  says(cost, "v1 has no paid calls, so the monthly cost cap, the cost ledger, and `--live` are not part of v1.");
  says(cost, "Local STT, the local model, local Piper or Kokoro, local Postgres, the local scheduler, the Next.js admin on the Mac mini, and own SearXNG have no hosted fee.");
  says(
    latency,
    "If Qwen 2.5 7B or Llama 3.1 8B misses that gate, the fallback is a smaller local model, a faster local voice, or both, and it stays local only.",
  );
  says(
    latency,
    "at most 3 seconds from when the user stops speaking until the first audio on the cassette player\u2019s speaker.",
  );
  assert.match(latency, /(?<![\d.])3 seconds/);
  says(admin, "Access: Tailscale.");
  says(admin, "Being on the tailnet is not enough.");
  says(admin, "Sign-in requires proof of identity: the Tailscale identity of an allowlisted user, verified server-side, plus an app session.");
  says(admin, "Verified server-side means the service checks that identity with `tailscale whois` or `tailscale serve`, and never trusts a client-supplied header.");
  says(admin, "The allowlist is a list of users, not a shared or tagged device.");
  says(admin, "Tailscale Funnel is not used for the admin.");
  says(admin, "The service binds to the tailnet interface or localhost only.");
  says(admin, "It does not listen on the LAN or on a public address.");
  says(voice, "The device verifies that it is talking to the paired Mac mini with a pinned certificate or a challenge.");
  says(voice, "The audio stream is encrypted (TLS or equivalent).");
  says(voice, "a pairing key is set in the web admin.");
  says(voice, "The backend rejects a device that does not present the current key.");
  says(voice, "The key is never committed to the public repository or to committed firmware.");
  says(admin, "Device rejection, key storage, and key rotation are the rule in section 5.");
  says(
    admin,
    "Secrets are handled server-side or encrypted. They never go into the public repository, into client-side source that is committed, or onto the screen in cleartext.",
  );
  says(v1Scope, "Secrets are handled server-side or encrypted, and never placed in the public code.");
  says(v1Scope, "Habit consent is the rule in section 6.");
  says(
    v1Scope,
    "a ready-made English wake word for the first demo, for example \u201cHey Jarvis\u201d.",
  );
  says(agent, "The radio does not store a habit until the user agrees, by voice or in the web admin.");
  says(milestone2, "Sign-in, binding, CSRF, and admin text are the rule in section 7.");
  says(milestone2, "Secrets handled server-side or encrypted, never in the public code.");
  says(milestone3, "Habit consent is the rule in section 6.");
  says(milestone3, "Encryption at rest and the memory backup are the rule in section 8.");
  says(milestone5, "Quiet hours and the unprompted cap are the decided rule in section 2.");
  says(milestone6, "habit consent is the rule in section 6");
  says(privacy, "A backup of memory is encrypted.");
  says(v1Scope, "Email is not in v1.");
  says(later, "It is parked until v2 (Daniel, 2026-11-27).");
  says(
    preamble,
    "Status: proposed. Direction decided by Daniel Hansson 2026-11-27; this spec becomes accepted when Daniel merges this PR.",
  );
  says(preamble, "The pairing key is the rule in section 5.");
  says(preamble, "The radio is the rule in section 4.");
  says(preamble, "User-facing language is the rule in section 2.2.");
  says(preamble, "Local models and the provider interface are the rules in section 5 and section 6.");
  says(what, "The wake word is the rule in section 2.1.");
  says(what, "The parts budget is the rule in section 4.");
  says(what, "Local models and the provider interface are the rules in section 5 and section 6.");
  says(v1Scope, "Station start is the rule in section 8.");
  says(v1Scope, "Sign-in is the rule in section 7.");
  says(later, "The pairing key is the rule in section 5.");
  says(changes, "The radio and the parts budget are the rule in section 4.");
  says(changes, "The wake word is the rule in section 2.1");
  says(changes, "Pairing and encryption are the rule in section 5");
  says(changes, "The local voice chain is the rule in section 5.");
  says(changes, "Sign-in is the rule in section 7.");
  says(changes, "Email and language are the rules in section 2");
  says(changes, "The decided rule in section 2");
  says(changes, "The gate is the rule in section 9");
  says(changes, "Local models are the rule in section 6");
  says(voice, "The wake word is the rule in section 2.1.");
  says(voice, "Sign-in is the rule in section 7.");
  says(voice, "The fallback if the gate is missed is the rule in section 9.");
  says(agent, "Quiet hours and the unprompted cap are the decided rule in section 2.");
  says(privacy, "The pairing key is the rule in section 5.");
  says(privacy, "Local models are the rule in section 6.");
  says(cost, "Local models are the rule in section 6.");
  says(milestone1, "The wake word, the local voice chain, and pairing are the rule in section 2.1 and section 5.");
  says(process, "The local model address is the rule in section 8.");
  says(impact, "If the gate is missed, the fallback is the rule in section 9");
  says(impact, "Local models are the rule in section 6");
  says(impact, "Pairing is the rule in section 5");
  says(impact, "The decided quiet-hours and unprompted rule in section 2");
  says(impact, "Swedish is a language option via the swappable providers, including KB-Whisper");
  says(impact, "The v1 TTS is the rule in section 5");
  says(impact, "The wake word is the rule in section 2.1.");
  says(impact, "The local voice chain is the rule in section 5");
  says(impact, "Latency is the rule in section 9.");
  says(measurement, "the fallback is the rule in section 9.");
  const localTable = [
    "| Part | v1 (local, Mac mini) |",
    "| -- | -- |",
    "| Speech-to-text | Whisper or Parakeet, English |",
    "| Language model | Qwen 2.5 7B or Llama 3.1 8B via Ollama or MLX, with tool calling |",
    "| Text-to-speech | Piper with an English voice, or Kokoro |",
    "| Memory | Postgres with pgvector on the Mac mini |",
    "| Agent jobs | Local scheduler on the Mac mini |",
    "| Web search | Own SearXNG (section 2.1) |",
  ].join("\n");
  const tableAt = voice.indexOf("| Part |");
  assert.equal(voice.slice(tableAt, voice.indexOf("\n\n", tableAt)), localTable);
  const sentHeading = "**What is sent to a model.** ";
  const sentAt = agent.indexOf(sentHeading);
  assert.equal(
    agent.slice(sentAt, agent.indexOf("\n\n", sentAt)),
    sentHeading +
      "v1 runs only local models on the Mac mini. Conversation, retrieved memories the user asked the radio to remember, and tool results stay on the Mac mini. Habit records stay on the Mac mini.",
  );
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
  assert.match(agents, /v1 makes no calls to any hosted model or speech provider\./);
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
