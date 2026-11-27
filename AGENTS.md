# AGENTS.md

## Confirm work

Run `npm run check` before calling work done. It runs typecheck, lint, and tests, and it exits non-zero on failure.

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm run test`
- One file: `node --experimental-strip-types --test test/repo.test.ts`

## Decisions

Radio Days is a voice agent in an old cassette player: an ESP32-S3 thin client and a Mac mini. SPEC.md is the product spec (v2.1). English is the v1 language. Linear PAN-267 tracks it, and both must be kept in sync. The Laget Bots team engine is shut down. Do not restore it.

The radio learns habits and may act on them on its own. A habit is a pattern it detects itself. A memory is something the user asks it to remember. Habit data stays on the Mac mini and is not sent to the AI provider. Each conversation has a token cap. v1 runs only local models on the Mac mini. The provider interface swaps one local model for another. v1 is wake word, voice chat, memory, calendar, web search, and a web admin. Spotify is later and needs written permission.

Tests of SPEC.md and docs check structure and a few short key facts per section. A safety limit is the whole sentence or the exact value, in the section that owns it. Each locked fact is written once there. Tests do not count occurrences, and they do not check section numbers or words that must not appear.
A doc test for a number or limit must match with a boundary (e.g. /(?<![\d.])99 SEK/). If a spec change removes a safety fact from a doc test, the PR body must say which one and why.

Read secrets from the environment only. Do not put keys in config, code, traces, or the public repo. Never include raw API keys in logs, errors, or telemetry. Never include raw provider response bodies in error messages (only provider id and HTTP status). Scrub the API key from any error (message, stack, cause chain) before passing it on, and replace the key with `[REDACTED]`.
Never echo an unknown key, an old key, or raw user input; write error messages as fixed text, and scrub both the raw secret and its trimmed form.
A secret in the environment must not by itself start a paid call; an explicit choice is required.

A test must fail for the defect it exists for. A test of a safety or cost rule must fail when that rule is broken. A measurement that uses mocks is not reply latency.

An unreadable cost counter blocks paid calls. Do not reset that counter to zero.

Give every spawned child an explicit env without secrets.

A test of a callback must use the same side effects as the production code.

A test of behaviour in `radio-main.ts` must call the same function the radio calls. When the decision sits in the main loop, move it to a pure function and test that function, so the test and the radio share the code. Removing that call must fail a test.

Gitleaks scans the full git history. A later commit does not remove an earlier match. Use `.gitleaksignore` with exact fingerprints only, never whole paths.

Put the Linear issue id in the branch name and the PR title. Use Linear's branch name, for example `pan-254-repo-agentsmd-och-ci`.

Update skills from `~/Desktop/skills` with `npm run sync-skills`. Edit adaptations only in `.cursor/skills/<name>/PROJECT.md`.

When you add TypeScript outside `src/` and `test/`, add that path to `include` in `tsconfig.json`.

When writing files to a target directory, do not follow existing symlinks and verify that every resolved path stays inside the directory. Replace symlinks instead of following them, and use path separator in prefix checks to avoid false positives.

## Handoffs

Handoffs go through artifacts, not free chat: PO writes the issue with goal and exit check -> dev writes the PR -> Vera reviews the PR on the exact head SHA -> Lazek tests the same SHA -> Daniel merges. Key decisions go in the issue or PR, not only in chat. Only one agent writes to a branch at a time.
