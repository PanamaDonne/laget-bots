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
  assert.match(preamble, /accepted/);
  assert.match(preamble, /v2\.0/);
  assert.match(spec, /PanamaDonne\/radio-days/);
});

test("SPEC.md records local Piper as the v1 text-to-speech choice", () => {
  const spec = readText("SPEC.md");
  const voice = section(spec, "Voice agent and everyday use", "Web admin");
  const decided = between(spec, "**Decided", "**Open:**");
  const cost = section(spec, "Running cost", "Decisions and open questions");

  for (const fact of [
    "Piper",
    "sv_SE-nst-medium",
    "sv_SE-alma-medium",
    "sv_SE-lisa-medium",
    "ReadSpeaker",
    "fallback",
    "Sten",
    "not available",
    "stays loaded",
  ]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
    assert.equal(decided.includes(fact), true, `decided missing ${fact}`);
  }
  for (const fact of ["gemma", "estimate"]) {
    assert.equal(cost.includes(fact), true, `cost missing ${fact}`);
  }
});

test("SPEC.md targets a cheap Pi 4 Model B and keeps Swedish voice local", () => {
  const spec = readText("SPEC.md");
  const what = section(spec, "What it is", "Scope");
  const hardware = section(spec, "Hardware", "An agent that learns");
  const voice = section(spec, "Voice agent and everyday use", "Web admin");
  const memory = section(spec, "Long-term memory", "Privacy, security and providers");
  const cost = section(spec, "Running cost", "Decisions and open questions");
  const decided = between(spec, "**Decided", "**Open:**");
  const open = spec.slice(spec.indexOf("**Open:**"));

  for (const fact of ["Pi 4 Model B", "cheap to build", "cheap to run", "1 GB", "2 GB", "PAN-300", "Suggestions are driven"]) {
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

  for (const fact of [
    "sv_SE-lisa-medium",
    "stays loaded",
    "zero monthly cost",
    "1 GB",
    "2 GB",
  ]) {
    assert.equal(voice.includes(fact), true, `voice missing ${fact}`);
  }

  for (const fact of ["on the Pi", "not the v1 path", "PAN-300"]) {
    assert.equal(memory.includes(fact), true, `memory missing ${fact}`);
  }

  for (const fact of ["speech-to-text", "conversation model", "zero monthly cost", "99 SEK", "on the Pi"]) {
    assert.equal(cost.includes(fact), true, `cost missing ${fact}`);
  }

  for (const fact of [
    "Pi 4 Model B",
    "1 GB",
    "2 GB",
    "sv_SE-lisa-medium",
    "stays loaded",
    "not the v1 path",
    "99 SEK",
  ]) {
    assert.equal(decided.includes(fact), true, `decided missing ${fact}`);
  }

  for (const fact of ["Hardware fit", "Quiet hours", "Spotify access", "Berget plan", "RAM", "Embedding model", "PAN-300", "1 GB", "2 GB"]) {
    assert.equal(open.includes(fact), true, `open missing ${fact}`);
  }
  assert.equal(open.split("**RAM.**").length, 2);
  assert.equal(open.split("**Embedding model").length, 2);
});

test("SPEC.md describes an agent that learns habits and acts on its own", () => {
  const spec = readText("SPEC.md");
  const what = section(spec, "What it is", "Scope");
  const behaviour = section(spec, "An agent that learns and decides", "Voice agent and everyday use");
  const approval = section(spec, "Physical approval", "Evals");
  const v1Scope = section(spec, "In scope for v1", "In scope for v2");
  const voice = section(spec, "Voice agent and everyday use", "Web admin");
  const memory = section(spec, "Long-term memory", "Privacy, security and providers");
  const cost = section(spec, "Running cost", "Decisions and open questions");
  const milestone1 = between(spec, "**Milestone 1:", "**Milestone 2:");
  const milestone2 = between(spec, "**Milestone 2:", "**Milestone 3:");
  const milestone4 = between(spec, "**Milestone 4:", "**Milestone 5:");
  const decided = between(spec, "**Decided", "**Open:**");
  const open = spec.slice(spec.indexOf("**Open:**"));

  for (const title of [
    "An agent that learns and decides",
    "Long-term memory",
    "Physical approval",
    "Running cost",
    "Decisions and open questions",
  ]) {
    assert.ok(headingIndex(spec, title) >= 0, title);
  }

  for (const fact of ["Kör Radio", "habits", "morning brief"]) {
    assert.equal(what.includes(fact), true, `intro missing ${fact}`);
  }

  for (const fact of [
    "habits",
    "confident enough",
    "unsure",
    "morning brief",
    "Nytt avsnitt",
    "deletes",
    "Berget",
    "agrees",
    "raw audio",
    "transcript",
    "ångra",
    "undone",
    "gmail.readonly",
    "gmail.send",
    "quiet hours",
  ]) {
    assert.equal(behaviour.includes(fact), true, `behaviour missing ${fact}`);
  }

  for (const fact of ["Kör Radio", "PAN-301", "announcements"]) {
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

  for (const fact of ["habits", "deletes", "Berget"]) {
    assert.equal(memory.includes(fact), true, `memory missing ${fact}`);
  }

  for (const fact of ["Kör Radio", "milestone 4"]) {
    assert.equal(milestone1.includes(fact), true, `milestone 1 missing ${fact}`);
  }
  assert.equal(milestone2.includes("milestone 4"), true);
  for (const fact of ["agrees", "deletes", "undone"]) {
    assert.equal(milestone4.includes(fact), true, `milestone 4 missing ${fact}`);
  }

  for (const fact of ["button", "undone"]) {
    assert.equal(approval.includes(fact), true, `approval missing ${fact}`);
  }

  for (const fact of ["99 SEK", "Kör Radio", "PAN-301", "2026-11-27", "Berget"]) {
    assert.equal(decided.includes(fact), true, `decided missing ${fact}`);
  }
  assert.equal(cost.includes("99 SEK"), true);
  assert.equal(cost.includes("locked"), true);

  for (const fact of ["Quiet hours", "still open", "Spotify", "Starter"]) {
    assert.equal(open.includes(fact), true, `open missing ${fact}`);
  }
});

test("README and AGENTS.md describe Radio Days and point at SPEC.md", () => {
  const readme = readText("README.md");
  const agents = readText("AGENTS.md");

  assert.match(readme, /Radio Days/);
  assert.match(readme, /\[SPEC\.md\]\(SPEC\.md\)/);
  assert.match(readme, /vanor/);
  assert.match(readme, /på egen hand/);
  assert.match(readme, /Pi 4 Model B/);
  assert.match(agents, /Pi 4 Model B/);
  assert.match(agents, /Radio Days/);
  assert.match(agents, /SPEC\.md/);
  assert.match(agents, /v2\.0/);
  assert.match(agents, /Vera/);
  assert.match(agents, /Lazek/);
  assert.match(agents, /sync-skills/);
  assert.match(agents, /Linear/);
  assert.match(agents, /habits/);
  assert.match(agents, /on its own/);
  assert.match(agents, /token cap/);
  assert.match(agents, /99 SEK/);
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
