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

test("SPEC.md is the accepted Radio Days v2.0 product spec", () => {
  const spec = readText("SPEC.md");
  const title = spec.split("\n", 1)[0] ?? "";
  const preamble = spec.split("\n## ")[0] ?? "";

  assert.match(title, /Radio Days/);
  assert.match(title, /v2\.0/);
  assert.equal(/\bdraft\b/i.test(title), false);
  assert.equal(/\bdraft\b/i.test(preamble), false);
  assert.match(preamble, /v2\.0/);
  assert.equal(preamble.includes("blob/main/SPEC.md"), false);
  assert.equal(preamble.includes("once that change is merged"), false);
  assert.equal(/SPEC\.md/.test(preamble) && /v1\.0/.test(preamble), false);
  assert.match(spec, /PanamaDonne\/radio-days/);
});

test("SPEC.md records local Piper as the v1 text-to-speech choice", () => {
  const spec = readText("SPEC.md");
  const decided = between(spec, "**Decided", "**Open:**");
  const open = spec.slice(spec.indexOf("**Open:**"));

  for (const fact of [
    "Piper",
    "sv_SE-nst-medium",
    "sv_SE-alma-medium",
    "sv_SE-lisa-medium",
    "ReadSpeaker",
  ]) {
    assert.equal(decided.includes(fact), true, fact);
  }
  assert.match(decided, /fallback/i);
  assert.equal(/text-to-speech|\bTTS\b|Piper|ReadSpeaker|\bSten\b/i.test(open), false);
  assert.equal(/not yet chosen|not decided|No option is picked|none picked/i.test(spec), false);
  assert.equal(spec.includes("default Berget model in this repo"), false);
  assert.equal(/if one is chosen|chosen instead of Piper/i.test(spec), false);

  for (const line of spec.split("\n")) {
    if (/\bsten\b/i.test(line)) assert.match(line, /\bnot\b/i);
    if (line.includes("gemma")) assert.equal(/\bdefault\b/i.test(line), false, line);
  }
});

test("SPEC.md targets a cheap Pi 4 Model B and keeps Swedish voice local", () => {
  const spec = readText("SPEC.md");
  const what = between(spec, "## 1. What it is", "## 2. Scope");
  const hardware = between(spec, "## 4. Hardware", "## 5. An agent");
  const voice = between(spec, "## 6. Voice agent", "## 7. Web admin");
  const memory = between(spec, "## 8. Long-term memory", "## 9. Privacy");
  const cost = between(spec, "## 14. Running cost", "## 15. Decisions");
  const decided = between(spec, "**Decided", "**Open:**");
  const open = spec.slice(spec.indexOf("**Open:**"));
  const readme = readText("README.md");
  const agents = readText("AGENTS.md");

  for (const fact of ["Pi 4 Model B", "cheap to build", "cheap to run", "1 GB", "2 GB", "PAN-300"]) {
    assert.equal(what.includes(fact), true, `intro missing ${fact}`);
  }

  for (const fact of [
    "Pi 4 Model B",
    "1 GB",
    "2 GB",
    "safe default",
    "PAN-300",
    "800",
    "1,200",
    "SEK",
    "heatsink",
    "DAC",
    "USB",
    "analog",
    "Pi 3 B+",
    "Pi Zero 2 W",
    "not targets",
  ]) {
    assert.equal(hardware.includes(fact), true, `hardware missing ${fact}`);
  }
  assert.equal(hardware.includes("4 GB"), false);
  assert.equal(hardware.includes("HiFiBerry"), false);

  for (const fact of [
    "sv_SE-nst-medium",
    "sv_SE-alma-medium",
    "sv_SE-lisa-medium",
    "medium",
    "x_low",
    "stays loaded",
    "zero monthly cost",
  ]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }

  assert.equal(memory.includes("not the v1 path"), true);
  assert.equal(memory.includes("PAN-300"), true);
  assert.equal(memory.includes("4 GB"), false);

  for (const fact of ["speech-to-text", "conversation model", "zero monthly cost", "800", "1,200"]) {
    assert.equal(cost.includes(fact), true, `cost missing ${fact}`);
  }

  for (const fact of [
    "2026-11-27",
    "Pi 4 Model B",
    "1 GB",
    "2 GB",
    "safe default",
    "PAN-300",
    "800",
    "1,200",
    "heatsink",
    "DAC",
    "USB",
    "Pi 3 B+",
    "Pi Zero 2 W",
    "x_low",
    "stays loaded",
    "zero monthly cost",
    "speech-to-text",
    "conversation model",
    "sv_SE-lisa-medium",
  ]) {
    assert.equal(decided.includes(fact), true, `decided missing ${fact}`);
  }

  for (const fact of ["1 GB", "2 GB", "safe default", "PAN-300", "Pi 4 Model B"]) {
    assert.equal(open.includes(fact), true, `open missing ${fact}`);
  }
  assert.equal(open.includes("4 GB"), false);

  assert.equal(spec.includes("4 GB"), false);
  assert.match(readme, /Pi 4 Model B/);
  assert.match(agents, /Pi 4 Model B/);
  assert.equal(readme.includes("4 GB"), false);
  assert.equal(agents.includes("4 GB"), false);
});

test("SPEC.md describes an agent that learns habits and acts on its own", () => {
  const spec = readText("SPEC.md");
  const what = between(spec, "## 1. What it is", "## 2. Scope");
  const behaviour = between(
    spec,
    "## 5. An agent that learns and decides",
    "## 6. Voice agent and everyday use",
  );
  const approval = between(
    spec,
    "## 10. Physical approval",
    "## 11. Evals",
  );
  const milestone1 = between(spec, "**Milestone 1:", "**Milestone 2:");
  const decided = between(spec, "**Decided", "**Open:**");
  const open = spec.slice(spec.indexOf("**Open:**"));
  const scopeLine = what.split("\n").find((line) => line.startsWith("v1 is "));

  const v1Scope = between(spec, "### 2.1 In scope for v1", "### 2.2 In scope for v2");
  const voice = between(spec, "## 6. Voice agent", "## 7. Web admin");
  const milestone2 = between(spec, "**Milestone 2:", "**Milestone 3:");
  const milestone4 = between(spec, "**Milestone 4:", "**Milestone 5:");
  const cost = between(spec, "## 14. Running cost", "## 15. Decisions");

  assert.ok(scopeLine, "missing v1 scope line");
  for (const fact of ["Kör Radio", "habits", "morning brief", "not in v1"]) {
    assert.equal(scopeLine?.includes(fact), true, `scope line missing ${fact}`);
  }

  for (const heading of [
    "## 5. An agent that learns and decides",
    "## 8. Long-term memory",
    "## 10. Physical approval",
    "## 14. Running cost",
    "## 15. Decisions",
  ]) {
    assert.equal(spec.includes(heading), true, heading);
  }

  for (const fact of [
    "habits",
    "confident enough",
    "unsure",
    "does not suggest",
    "morning brief",
    "not a learned suggestion",
    "not in v1",
    "Nytt avsnitt",
    "until the user deletes",
    "never sent",
    "Berget",
    "agrees",
    "raw audio",
    "transcript",
    "ångra",
    "undone",
    "gmail.readonly",
    "gmail.send",
    "never start",
    "quiet hours",
  ]) {
    assert.equal(behaviour.includes(fact), true, `behaviour missing ${fact}`);
  }

  for (const fact of ["Kör Radio", "PAN-301", "No important proactive announcements in v1"]) {
    assert.equal(v1Scope.includes(fact), true, `v1 scope missing ${fact}`);
  }

  for (const fact of [
    "user-modify-playback-state",
    "playlist-modify-private",
    "playlist-modify-public",
    "user-library-modify",
    "user-read-playback-position",
    "user-read-recently-played",
    "III.13",
    "III.14",
    "III.3",
  ]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }

  assert.equal(milestone1.includes("Kör Radio"), true);
  assert.equal(milestone1.includes("milestone 4"), true);
  assert.equal(milestone1.includes("confident enough"), false);
  assert.equal(milestone2.includes("undone"), true);
  assert.equal(milestone2.includes("milestone 4"), true);
  assert.equal(milestone4.includes("agrees"), true);
  assert.equal(milestone4.includes("not sent"), true);

  assert.match(approval, /physical approval button/);
  assert.match(approval, /undone/);

  for (const fact of ["99 SEK", "Kör Radio", "PAN-301", "2026-11-27", "Berget"]) {
    assert.equal(decided.includes(fact), true, `decided missing ${fact}`);
  }
  assert.equal(cost.includes("99 SEK"), true);
  assert.equal(cost.includes("proposal, not locked"), false);

  assert.match(open, /Quiet hours/);
  assert.match(open, /still open/);
  assert.equal(open.includes("Exact wake word"), false);
  assert.equal(/pending Daniel/i.test(open), false);
});

test("README and AGENTS.md describe Radio Days and point at SPEC.md", () => {
  const readme = readText("README.md");
  const agents = readText("AGENTS.md");

  assert.match(readme, /Radio Days/);
  assert.match(readme, /\[SPEC\.md\]\(SPEC\.md\)/);
  assert.equal(readme.includes("npm run team"), false);
  assert.equal(readme.includes("example-team.json"), false);
  assert.match(agents, /Radio Days/);
  assert.match(agents, /SPEC\.md/);
  assert.match(agents, /v2\.0/);
  assert.match(agents, /Vera/);
  assert.match(agents, /Lazek/);
  assert.match(agents, /sync-skills/);
  assert.match(agents, /Linear/);
  assert.match(readme, /habits/);
  assert.match(readme, /on its own/);
  assert.match(agents, /habits/);
  assert.match(agents, /on its own/);
  assert.match(agents, /token cap/);
  assert.match(agents, /99 SEK/);
  for (const stale of [
    "defaultModel",
    "maxTurns",
    "UTF-16",
    "code point",
    "untrusted",
    "ConfiguredProvider",
  ]) {
    assert.equal(agents.includes(stale), false, stale);
  }
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
