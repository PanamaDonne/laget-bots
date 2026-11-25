# AGENTS.md

## Confirm work

Run `npm run check` before calling work done. It runs typecheck, lint, and tests, and it exits non-zero on failure.

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm run test`
- One file: `node --experimental-strip-types --test test/repo.test.ts`

## Decisions

Read secrets from the environment only. Do not put keys in config, code, or traces.

Put the Linear issue id in the branch name and the PR title. Use Linear's branch name, for example `pan-254-repo-agentsmd-och-ci`.

The dev flow runs against a sandbox repo only.

Update skills from `~/Desktop/skills` with `npm run sync-skills`. Edit adaptations only in `.cursor/skills/<name>/PROJECT.md`.

When you add TypeScript outside `src/` and `test/`, add that path to `include` in `tsconfig.json`.

## Handoffs

Handoffs go through artifacts, not free chat: PO writes the issue with goal and exit check -> dev writes the PR -> Vera reviews the PR on the exact head SHA -> Lazek tests the same SHA -> Daniel merges. Key decisions go in the issue or PR, not only in chat. Only one agent writes to a branch at a time.
