import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { processCgroupDir, readCgroupLimits } from "../src/cgroup.ts";
import { WHISPER_BASE } from "../src/models.ts";
import { buildPrecheckReport } from "../src/precheck.ts";
import { ORDINARY_ROOM_SPEECH, measureFalseAlarms } from "../src/wake.ts";

test("a mock pre-check is not reported as reply latency and is not the 3 second gate", () => {
  const alarms = measureFalseAlarms(ORDINARY_ROOM_SPEECH);
  const report = buildPrecheckReport({
    latencyMs: 120,
    falseAlarms: alarms.falseAlarms,
    checked: alarms.checked,
    modelsRan: false,
    enforcedCpus: 4,
    enforcedMemoryMb: 2048,
  });

  assert.equal(report.countsAsThreeSecondGate, false);
  assert.equal(report.gateOwner, "PAN-300");
  assert.equal(report.requestedCpus, 4);
  assert.equal(report.requestedMemoryMb, 2048);
  assert.equal(report.enforcedCpus, 4);
  assert.equal(report.enforcedMemoryMb, 2048);
  assert.equal(report.latencyMs, null);
  assert.equal(report.modelsRan, false);
  assert.equal(report.ordinarySpeechFalseAlarms, 0);
  assert.equal(report.whisperModel, WHISPER_BASE);
  assert.equal(report.latencyKind, "not-measured");
});

test("the pre-check times local Whisper and Piper and does not call the chat model", () => {
  const source = readFileSync("src/precheck-cli.ts", "utf8");
  const script = readFileSync("scripts/precheck-container.sh", "utf8");

  assert.match(source, /voice-worker\.py/);
  assert.match(source, /mockedChatReply/);
  assert.match(source, /utterance-16k-s16le\.pcm/);
  assert.match(source, /HF_HUB_OFFLINE/);
  assert.equal(source.includes("completeChat"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("calledModel"), false);
  const utterance = readFileSync("test/fixtures/utterance-16k-s16le.pcm");
  assert.equal(utterance.length > 1000, true);
  assert.match(script, /2147483648/);
  assert.match(script, /400000 100000/);
  assert.match(script, /KBLab\/kb-whisper-base/);
});

test("model latency stays a number and still is not the 3 second gate", () => {
  const report = buildPrecheckReport({
    latencyMs: 120,
    falseAlarms: 0,
    checked: 1,
    modelsRan: true,
    enforcedCpus: 4,
    enforcedMemoryMb: 2048,
  });

  assert.equal(report.latencyMs, 120);
  assert.equal(report.modelsRan, true);
  assert.equal(report.latencyKind, "model");
  assert.equal(report.countsAsThreeSecondGate, false);
  assert.equal(report.gateOwner, "PAN-300");
});

test("the process cgroup path is taken from /proc/self/cgroup", () => {
  assert.equal(
    processCgroupDir("0::/system.slice/radio-days\n"),
    "/sys/fs/cgroup/system.slice/radio-days",
  );
  assert.equal(processCgroupDir("0::/\n"), "/sys/fs/cgroup");
});

test("cgroup files report the container cpu and memory limits", () => {
  const limits = readCgroupLimits((path) => {
    if (path.endsWith("memory.max")) return "2147483648\n";
    if (path.endsWith("cpu.max")) return "400000 100000\n";
    return null;
  });

  assert.equal(limits.memoryMb, 2048);
  assert.equal(limits.cpus, 4);
});
