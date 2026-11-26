# AGENTS.md

## Confirm work

Run `npm run check` before calling work done. It runs typecheck, lint, and tests, and it exits non-zero on failure.

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm run test`
- One file: `node --experimental-strip-types --test test/repo.test.ts`

## Decisions

Read secrets from the environment only. Do not put keys in config, code, or traces. `ConfiguredProvider` is safe to serialize (redacts the key), but never include raw API keys in logs, errors, or telemetry. Never expose a `ConfiguredProvider` on a public client surface; use `toSafeProvider()` instead. Never include raw provider response bodies in error messages (only provider id and HTTP status). Scrub the API key from any error (message, stack, cause chain) before passing it on; use the `sanitizeErrorChain` pattern to replace the key with `[REDACTED]`.

Provider `defaultModel` must be a valid, current model id at the provider. Remove or leave undefined until confirmed.

A handoff or question must match an agent id, name or role exactly. An unknown, empty or ambiguous target is an error, never silent work or first partial match.

Gitleaks scans the full git history. A later commit does not remove an earlier match. Use `.gitleaksignore` with exact fingerprints only, never whole paths.

Put the Linear issue id in the branch name and the PR title. Use Linear's branch name, for example `pan-254-repo-agentsmd-och-ci`.

The dev flow runs against a sandbox repo only.

Update skills from `~/Desktop/skills` with `npm run sync-skills`. Edit adaptations only in `.cursor/skills/<name>/PROJECT.md`.

When you add TypeScript outside `src/` and `test/`, add that path to `include` in `tsconfig.json`.

When writing files to a target directory, do not follow existing symlinks and verify that every resolved path stays inside the directory. Replace symlinks instead of following them, and use path separator in prefix checks to avoid false positives.

## Handoffs

Handoffs go through artifacts, not free chat: PO writes the issue with goal and exit check -> dev writes the PR -> Vera reviews the PR on the exact head SHA -> Lazek tests the same SHA -> Daniel merges. Key decisions go in the issue or PR, not only in chat. Only one agent writes to a branch at a time.
