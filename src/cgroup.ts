export type CgroupLimits = {
  cpus: number | null;
  memoryMb: number | null;
};

export function processCgroupDir(cgroupText: string): string {
  const line = cgroupText.split("\n").find((entry) => entry.startsWith("0::"));
  if (line === undefined) return "/sys/fs/cgroup";
  const path = line.slice(3).trim();
  if (path.length === 0 || path === "/") return "/sys/fs/cgroup";
  return `/sys/fs/cgroup${path}`;
}

export function readCgroupLimits(
  readFile: (path: string) => string | null,
  dir = "/sys/fs/cgroup",
): CgroupLimits {
  return {
    memoryMb: parseMemory(readFile(`${dir}/memory.max`)),
    cpus: parseCpu(readFile(`${dir}/cpu.max`)),
  };
}

export function readProcessCgroupLimits(readFile: (path: string) => string | null): CgroupLimits {
  const described = readFile("/proc/self/cgroup");
  const dir = described === null ? "/sys/fs/cgroup" : processCgroupDir(described);
  return readCgroupLimits(readFile, dir);
}

function parseMemory(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value / (1024 * 1024));
}

function parseCpu(raw: string | null): number | null {
  if (raw === null) return null;
  const [quota, period] = raw.trim().split(/\s+/);
  if (quota === undefined || period === undefined || quota === "max") return null;
  const quotaUs = Number(quota);
  const periodUs = Number(period);
  if (!Number.isFinite(quotaUs) || !Number.isFinite(periodUs) || periodUs <= 0) return null;
  return quotaUs / periodUs;
}
