import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const SKILL_NAMES = [
  "agent-loops",
  "agents-md-maintenance",
  "mr-audit-code",
  "mrs-security",
] as const;

export const ADAPTATION_FILE = "PROJECT.md";
export const VERSION_FILE = "master-versions.json";
export const MASTER_SOURCE = "~/Desktop/skills";

export const ADAPTATION_TEMPLATE = `# Project adaptation

Project-specific notes for this skill live here. \`npm run sync-skills\` does not change this file.
`;

export type SkillFile = {
  relativePath: string;
  content: Buffer;
};

export type SkillSyncStatus = {
  name: string;
  masterSha256: string;
  previousSha256: string | null;
  wasStale: boolean;
};

export type SyncSkillsOptions = {
  masterDir: string;
  destDir: string;
  skillNames?: readonly string[];
  write?: boolean;
};

type VersionEntry = {
  masterSha256: string;
  files: string[];
};

type Manifest = {
  source: string;
  skills: Record<string, VersionEntry>;
};

export function masterSha256(files: readonly SkillFile[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((left, right) => comparePath(left.relativePath, right.relativePath));
  for (const file of sorted) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function syncSkills(options: SyncSkillsOptions): SkillSyncStatus[] {
  const skillNames = options.skillNames ?? SKILL_NAMES;
  const write = options.write ?? true;
  if (!existsSync(options.masterDir)) {
    throw new Error(`Skills master not found: ${options.masterDir}`);
  }

  const loaded = skillNames.map((name) => {
    const skillMaster = join(options.masterDir, name);
    if (!existsSync(skillMaster) || !statSync(skillMaster).isDirectory()) {
      throw new Error(`Missing skill "${name}" in ${options.masterDir}`);
    }
    const files = readTree(skillMaster);
    return { name, files, masterSha256: masterSha256(files) };
  });

  const manifest = readManifest(options.destDir);
  const statuses = loaded.map((skill) => {
    const skillDir = join(options.destDir, skill.name);
    const previousSha256 = recordedHash(manifest, skill.name);
    const destHash = existsSync(skillDir) ? masterSha256(readTree(skillDir)) : null;
    const wasStale = destHash !== skill.masterSha256 || previousSha256 !== skill.masterSha256;
    return {
      name: skill.name,
      masterSha256: skill.masterSha256,
      previousSha256,
      wasStale,
    };
  });

  if (!write) {
    return statuses;
  }

  mkdirSync(options.destDir, { recursive: true });
  for (const skill of loaded) {
    writeSkill(join(options.destDir, skill.name), skill.files);
  }
  writeManifest(options.destDir, loaded);
  return statuses;
}

function writeSkill(skillDir: string, files: readonly SkillFile[]): void {
  mkdirSync(skillDir, { recursive: true });
  const keep = new Set<string>();
  for (const file of files) {
    keep.add(file.relativePath);
    const absolute = join(skillDir, ...file.relativePath.split("/"));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.content);
  }

  for (const relativePath of listRelativeFiles(skillDir)) {
    if (relativePath === ADAPTATION_FILE || keep.has(relativePath)) {
      continue;
    }
    rmSync(join(skillDir, ...relativePath.split("/")));
  }
  removeEmptyDirectories(skillDir);

  const adaptationPath = join(skillDir, ADAPTATION_FILE);
  if (!existsSync(adaptationPath)) {
    writeFileSync(adaptationPath, ADAPTATION_TEMPLATE);
  }
}

function writeManifest(
  destDir: string,
  skills: readonly { name: string; files: readonly SkillFile[]; masterSha256: string }[],
): void {
  const manifest: Manifest = { source: MASTER_SOURCE, skills: {} };
  for (const skill of skills) {
    manifest.skills[skill.name] = {
      masterSha256: skill.masterSha256,
      files: skill.files.map((file) => file.relativePath),
    };
  }
  writeFileSync(join(destDir, VERSION_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifest(destDir: string): Manifest | null {
  const manifestPath = join(destDir, VERSION_FILE);
  if (!existsSync(manifestPath)) {
    return null;
  }
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isManifest(parsed)) {
    throw new Error(`Invalid ${VERSION_FILE}`);
  }
  return parsed;
}

function isManifest(value: unknown): value is Manifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("source" in value) || !("skills" in value)) {
    return false;
  }
  return typeof value.source === "string" && typeof value.skills === "object" && value.skills !== null;
}

function recordedHash(manifest: Manifest | null, name: string): string | null {
  if (manifest === null) {
    return null;
  }
  const entry = manifest.skills[name];
  if (entry === undefined || typeof entry.masterSha256 !== "string") {
    return null;
  }
  return entry.masterSha256;
}

function readTree(dir: string): SkillFile[] {
  const files: SkillFile[] = [];
  walk(dir, dir, files, true);
  files.sort((left, right) => comparePath(left.relativePath, right.relativePath));
  return files;
}

function listRelativeFiles(dir: string): string[] {
  const files: SkillFile[] = [];
  walk(dir, dir, files, false);
  return files.map((file) => file.relativePath);
}

function walk(root: string, dir: string, files: SkillFile[], skipRootAdaptation: boolean): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, absolute, files, skipRootAdaptation);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relativePath = relative(root, absolute).split(sep).join("/");
    if (
      relativePath === VERSION_FILE ||
      (skipRootAdaptation && relativePath === ADAPTATION_FILE)
    ) {
      continue;
    }
    files.push({
      relativePath,
      content: readFileSync(absolute),
    });
  }
}

function removeEmptyDirectories(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const absolute = join(dir, entry.name);
    removeEmptyDirectories(absolute);
    if (readdirSync(absolute).length === 0) {
      rmdirSync(absolute);
    }
  }
}

function comparePath(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function syncState(write: boolean, wasStale: boolean): "current" | "outdated" | "updated" {
  if (!wasStale) {
    return "current";
  }
  if (write) {
    return "updated";
  }
  return "outdated";
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function main(): void {
  const masterDir = join(homedir(), "Desktop", "skills");
  const destDir = join(process.cwd(), ".cursor", "skills");
  const write = !process.argv.includes("--check");
  try {
    const results = syncSkills({ masterDir, destDir, write });
    for (const result of results) {
      const state = syncState(write, result.wasStale);
      console.log(`${result.name} ${state} ${result.masterSha256}`);
    }
    if (!write && results.some((result) => result.wasStale)) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Skill sync failed";
    console.error(message);
    process.exitCode = 1;
  }
}

if (isDirectRun()) {
  main();
}
