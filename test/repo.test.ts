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
  assert.equal(/\bdraft\b/i.test(spec), false);
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

  for (const fact of ["Piper", "sv_SE-nst-medium", "sv_SE-alma-medium", "ReadSpeaker"]) {
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

test("SPEC.md describes an agent that learns habits and acts on its own", () => {
  const spec = readText("SPEC.md");
  const what = between(spec, "## 1. What it is", "## 2. Scope");
  const scope = between(spec, "## 2. Scope", "## 3. What is kept");
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

  assert.ok(scopeLine, "missing v1 scope line");
  assert.match(what, /gets to know the user and makes its own decisions/);
  for (const fact of [
    "habits and preferences",
    "confident enough",
    "unsure",
    "morning brief",
    "less important",
    "calendar reminders",
    "senders the user has chosen",
    "Multi-step goal planning is not in v1",
  ]) {
    assert.equal(scopeLine.includes(fact), true, `scope line missing ${fact}`);
  }

  for (const fact of [
    "Primary",
    "habits and preferences",
    "confident enough",
    "asks only when it is unsure",
    "Secondary",
    "morning brief",
    "less important",
    "calendar reminders",
    "senders the user has chosen",
    "Gmail in v2",
    "Multi-step goal planning",
    "not in v1",
    "does not speak unprompted during quiet hours",
    "How often",
    "turn autonomous behaviour off",
    "forget",
    "by voice and in the web admin",
    "on-device encrypted memory",
    "The cloud sees only status",
    "physical approval button",
    "email",
  ]) {
    assert.equal(behaviour.includes(fact), true, `behaviour section missing ${fact}`);
  }
  assert.match(behaviour, /section 8/);
  assert.match(behaviour, /section 10/);
  assert.equal(spec.includes("## 8. Long-term memory"), true);
  assert.equal(spec.includes("## 10. Physical approval"), true);

  assert.match(scope, /quiet hours/);
  assert.match(scope, /multi-step goal planning/i);
  assert.match(scope, /on-device encrypted memory/);

  assert.match(approval, /consequences outside the radio/);
  assert.match(approval, /physical approval button/);
  assert.match(approval, /acting on its own/);

  assert.match(milestone1, /confident enough/);
  assert.match(milestone1, /asks/);
  assert.match(milestone1, /quiet hours/);
  assert.match(milestone1, /multi-step goal planning/i);
  assert.match(milestone1, /physical approval button/);

  assert.match(decided, /learns habits and preferences/);
  assert.match(decided, /Daniel, 2026-11-26/);
  assert.match(decided, /physical approval button/);
  assert.match(open, /Quiet hours/);
  assert.match(open, /still open/);
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
