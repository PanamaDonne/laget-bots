import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ADAPTATION_FILE,
  ADAPTATION_TEMPLATE,
  SKILL_NAMES,
  VERSION_FILE,
  masterSha256,
  syncSkills,
} from "../src/sync-skills.ts";

const root = new URL("../", import.meta.url);

function readText(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function tempRepo(): { masterDir: string; destDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "laget-skills-"));
  return { masterDir: join(dir, "master"), destDir: join(dir, "dest") };
}

function writeMaster(masterDir: string, name: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(masterDir, name, relativePath);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content);
  }
}

function seedMasters(masterDir: string): void {
  for (const name of SKILL_NAMES) {
    writeMaster(masterDir, name, { "SKILL.md": `# ${name}\n` });
  }
}

test("masterSha256 changes when master file bytes change", () => {
  const before = masterSha256([{ relativePath: "SKILL.md", content: Buffer.from("a\n") }]);
  const after = masterSha256([{ relativePath: "SKILL.md", content: Buffer.from("b\n") }]);

  assert.equal(before, createHash("sha256").update("SKILL.md\0a\n\0").digest("hex"));
  assert.notEqual(before, after);
});

test("sync copies master skills and records their version", () => {
  const { masterDir, destDir } = tempRepo();
  seedMasters(masterDir);
  writeMaster(masterDir, "agent-loops", {
    "SKILL.md": "# agent-loops\n",
    "templates/bug-report-to-pr.md": "# bug\n",
  });

  const results = syncSkills({ masterDir, destDir });
  const agentLoops = results.find((result) => result.name === "agent-loops");

  assert.equal(readFileSync(join(destDir, "agent-loops", "SKILL.md"), "utf8"), "# agent-loops\n");
  assert.equal(
    readFileSync(join(destDir, "agent-loops", "templates", "bug-report-to-pr.md"), "utf8"),
    "# bug\n",
  );
  assert.equal(agentLoops?.wasStale, true);
  assert.equal(
    agentLoops?.masterSha256,
    masterSha256([
      { relativePath: "SKILL.md", content: Buffer.from("# agent-loops\n") },
      { relativePath: "templates/bug-report-to-pr.md", content: Buffer.from("# bug\n") },
    ]),
  );

  const manifest = JSON.parse(readFileSync(join(destDir, VERSION_FILE), "utf8")) as {
    source: string;
    skills: Record<string, { masterSha256: string; files: string[] }>;
  };
  assert.equal(manifest.source, "~/Desktop/skills");
  assert.deepEqual(manifest.skills["agent-loops"]?.files, [
    "SKILL.md",
    "templates/bug-report-to-pr.md",
  ]);
  assert.equal(manifest.skills["agent-loops"]?.masterSha256, agentLoops?.masterSha256);
});

test("sync updates a changed master skill and keeps PROJECT.md", () => {
  const { masterDir, destDir } = tempRepo();
  seedMasters(masterDir);
  syncSkills({ masterDir, destDir });

  const adaptation = "# Keep this project note\n";
  writeFileSync(join(destDir, "mr-audit-code", ADAPTATION_FILE), adaptation);
  writeFileSync(join(masterDir, "mr-audit-code", ADAPTATION_FILE), "# Master must not win\n");
  writeFileSync(join(masterDir, "mr-audit-code", "SKILL.md"), "# updated\n");
  writeFileSync(join(destDir, "mr-audit-code", "notes.md"), "extra\n");

  const results = syncSkills({ masterDir, destDir });
  const audited = results.find((result) => result.name === "mr-audit-code");

  assert.equal(readFileSync(join(destDir, "mr-audit-code", "SKILL.md"), "utf8"), "# updated\n");
  assert.equal(readFileSync(join(destDir, "mr-audit-code", ADAPTATION_FILE), "utf8"), adaptation);
  assert.equal(existsSync(join(destDir, "mr-audit-code", "notes.md")), false);
  assert.equal(audited?.wasStale, true);
  assert.notEqual(audited?.previousSha256, audited?.masterSha256);
});

test("a second sync with the same master reports the skill current", () => {
  const { masterDir, destDir } = tempRepo();
  seedMasters(masterDir);
  syncSkills({ masterDir, destDir });

  const results = syncSkills({ masterDir, destDir });

  assert.equal(results.every((result) => result.wasStale === false), true);
  assert.equal(
    readFileSync(join(destDir, "mrs-security", ADAPTATION_FILE), "utf8"),
    ADAPTATION_TEMPLATE,
  );
});

test("check reports an outdated skill without writing", () => {
  const { masterDir, destDir } = tempRepo();
  seedMasters(masterDir);
  syncSkills({ masterDir, destDir });
  const before = readFileSync(join(destDir, "agents-md-maintenance", "SKILL.md"));
  writeFileSync(join(masterDir, "agents-md-maintenance", "SKILL.md"), "# drifted\n");

  const results = syncSkills({ masterDir, destDir, write: false });
  const drifted = results.find((result) => result.name === "agents-md-maintenance");

  assert.equal(drifted?.wasStale, true);
  assert.deepEqual(readFileSync(join(destDir, "agents-md-maintenance", "SKILL.md")), before);
});

test("sync copies nested PROJECT.md and master-versions.json from the master", () => {
  const { masterDir, destDir } = tempRepo();
  seedMasters(masterDir);
  writeMaster(masterDir, "mr-audit-code", {
    "SKILL.md": "# mr-audit-code\n",
    "templates/PROJECT.md": "# nested project\n",
    "templates/master-versions.json": "{\"from\":\"master\"}\n",
  });
  syncSkills({ masterDir, destDir });
  mkdirSync(join(destDir, "mr-audit-code", "templates"), { recursive: true });
  writeFileSync(join(destDir, "mr-audit-code", ADAPTATION_FILE), "# Keep this project note\n");
  writeFileSync(join(destDir, "mr-audit-code", "templates", "PROJECT.md"), "# stale nested\n");
  writeFileSync(
    join(destDir, "mr-audit-code", "templates", "master-versions.json"),
    "{\"from\":\"stale\"}\n",
  );

  syncSkills({ masterDir, destDir });

  assert.equal(
    readFileSync(join(destDir, "mr-audit-code", "templates", "PROJECT.md"), "utf8"),
    "# nested project\n",
  );
  assert.equal(
    readFileSync(join(destDir, "mr-audit-code", "templates", "master-versions.json"), "utf8"),
    "{\"from\":\"master\"}\n",
  );
  assert.equal(
    readFileSync(join(destDir, "mr-audit-code", ADAPTATION_FILE), "utf8"),
    "# Keep this project note\n",
  );
});

test("sync removes a master file that disappeared and leaves the adaptation", () => {
  const { masterDir, destDir } = tempRepo();
  seedMasters(masterDir);
  writeMaster(masterDir, "agent-loops", {
    "SKILL.md": "# agent-loops\n",
    "templates/old.md": "# old\n",
  });
  syncSkills({ masterDir, destDir });
  writeMaster(masterDir, "agent-loops", { "SKILL.md": "# agent-loops\n" });
  rmSync(join(masterDir, "agent-loops", "templates"), { recursive: true });

  syncSkills({ masterDir, destDir });

  assert.equal(existsSync(join(destDir, "agent-loops", "templates", "old.md")), false);
  assert.equal(existsSync(join(destDir, "agent-loops", ADAPTATION_FILE)), true);
});

test("sync fails when a required skill is missing and writes nothing", () => {
  const { masterDir, destDir } = tempRepo();
  mkdirSync(masterDir, { recursive: true });
  writeMaster(masterDir, "mr-audit-code", { "SKILL.md": "# mr\n" });

  assert.throws(
    () => syncSkills({ masterDir, destDir }),
    /Missing skill "agent-loops"/,
  );
  assert.equal(existsSync(destDir), false);
});

test("package.json exposes sync-skills", () => {
  const pkg = JSON.parse(readText("package.json")) as { scripts?: Record<string, string> };

  assert.equal(
    pkg.scripts?.["sync-skills"],
    "node --experimental-strip-types src/sync-skills.ts",
  );
});

test("committed skills match the recorded master versions", () => {
  const manifest = JSON.parse(readText(`.cursor/skills/${VERSION_FILE}`)) as {
    source: string;
    skills: Record<string, { masterSha256: string; files: string[] }>;
  };

  assert.equal(manifest.source, "~/Desktop/skills");
  for (const name of SKILL_NAMES) {
    const skillDir = join(fileURLToPath(root), ".cursor", "skills", name);
    assert.equal(readFileSync(join(skillDir, "SKILL.md"), "utf8").length > 0, true);
    assert.equal(existsSync(join(skillDir, ADAPTATION_FILE)), true);
    const recorded = manifest.skills[name];
    assert.ok(recorded);
    const files = recorded.files.map((relativePath) => ({
      relativePath,
      content: readFileSync(join(skillDir, ...relativePath.split("/"))),
    }));
    assert.equal(masterSha256(files), recorded.masterSha256);
  }
});

test("committed copies match ~/Desktop/skills when the master is present", (t) => {
  const desktop = join(homedir(), "Desktop", "skills");
  if (!existsSync(join(desktop, "mr-audit-code", "SKILL.md"))) {
    t.skip("desktop skills master is not on this machine");
    return;
  }

  const manifest = JSON.parse(readText(`.cursor/skills/${VERSION_FILE}`)) as {
    skills: Record<string, { files: string[] }>;
  };

  for (const name of SKILL_NAMES) {
    const files = manifest.skills[name]?.files;
    assert.ok(files);
    for (const relativePath of files) {
      const parts = relativePath.split("/");
      const committed = readFileSync(join(fileURLToPath(root), ".cursor", "skills", name, ...parts));
      const master = readFileSync(join(desktop, name, ...parts));
      assert.deepEqual(committed, master);
    }
  }
});
