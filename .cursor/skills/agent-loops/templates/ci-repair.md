# CI repair (read logs, fix, rerun until green)

Inspiration: [Moka, loop 4](https://craftbettersoftware.com/p/loop-engineering-9-ways-to-automate).
Follow the shared rules in [SKILL.md](../SKILL.md).

## Trigger

A CI run fails on a pull request or on the default branch.

## Inputs

- The failed run URL, SHA, and job logs. On GitHub,
  `gh run view --log-failed` is a documented `gh` command Moka also
  uses.
- The branch that failed. Prefer fixing the existing PR branch when
  the failure is on a PR; open a new branch only when main itself is
  red.
- The repo's test, lint, and typecheck commands.

## Steps

1. Read the failing job logs. Classify: product bug, test bug,
   flaky infrastructure, missing secret, or broken dependency.
2. If you cannot reproduce locally or in the same CI job, or the
   failure is permissions/secrets/infra, escalate. Do not skip tests
   and do not mark the job `continue-on-error`.
3. If a product or test assertion bug is clear, write or use a
   failing test (red), fix, and rerun the same checks (green).
4. Push and wait for CI on the new SHA. If it is still red, repeat
   from step 1. After three unsuccessful fix pushes, stop and comment
   with the logs.

## Exit criterion

The same checks that failed are green on the new head SHA. Escalation
is a valid exit: a comment with the log link and why a human is
needed.

## Max iterations

3 fix pushes, then stop. Cursor Bugbot Autofix uses the same cap when
committing to an existing branch
([Bugbot](https://cursor.com/docs/bugbot)).

## Guardrails

All shared guardrails, especially:

- **Never skip, delete, or weaken a test** to get a green run.
  Cursor's marketplace CI autofix prompt says: if the failure is a
  flaky test, "create a new PR that skips that test"
  ([CI autofix](https://cursor.com/workflows/autonomous-agents/ci-autofix)).
  That instruction is unsafe; do not use it. Escalate flakes.
- Do not disable required checks, shrink `paths-ignore`, or raise
  timeouts to hide slowness (see [ci-speed](ci-speed.md) for
  legitimate timing work). Do not weaken or delete the
  anti-test-gaming CI check in [SKILL.md](../SKILL.md). If that
  check is what failed, escalate to a human.
- Skip the agent's own commits when you wire `workflow_run`, or the
  loop retriggers itself. Claude Code GitHub Action rejects bot
  actors unless listed in `allowed_bots`
  ([docs](https://code.claude.com/docs/en/github-actions)).
- Independent reviewer after the fix lands on the PR.

## PR output

Shared format in [SKILL.md](../SKILL.md), plus the failed run URL
and the green rerun URL.

## How to wire

- **Cursor Automations.** GitHub trigger **CI completed** (a check
  finishes on a PR or branch). **Workflow run completed** only
  matches GitHub Actions runs started by `push`; scheduled,
  `pull_request`, and `workflow_dispatch` runs do not match — use
  CI completed for PR checks
  ([Automations](https://cursor.com/docs/cloud-agent/automations)).
  Start from the marketplace [CI autofix](https://cursor.com/workflows/autonomous-agents/ci-autofix)
  template only after you delete the "skip that test" line and add
  this skill's guardrails and three-round cap.
- **GitHub Actions.** A second workflow on `workflow_run` with
  `conclusion == failure`, passing logs into
  `anthropics/claude-code-action@v1`, with `--max-turns` and a
  timeout, and a condition that skips runs caused by the fixer
  itself ([docs](https://code.claude.com/docs/en/github-actions)).
  If CI must run on the agent's commits, do not authenticate the
  action as `GITHUB_TOKEN`.
- **Claude Code scheduled task / headless.** Possible, but an event
  trigger is a better fit than polling. Headless flags:
  ([Headless](https://code.claude.com/docs/en/headless)).
