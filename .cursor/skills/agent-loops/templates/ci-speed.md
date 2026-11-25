# CI speed (optimize until a time target)

Inspiration: [Moka, loop 7](https://craftbettersoftware.com/p/loop-engineering-9-ways-to-automate).
Follow the shared rules in [SKILL.md](../SKILL.md).

## Trigger

A weekly schedule, or a human request when the pipeline is over a
stated time target (Moka's example is 6 minutes; use the number the
repo actually wants).

## Inputs

- The time target (minutes), written in the prompt or in `AGENTS.md`.
- Recent run timings. On GitHub, `gh run view --json jobs` is a
  documented `gh` command that includes job-level timing.
- The workflow files, cache config, and test commands.

## Steps

1. Measure a baseline: median (or a stated percentile) of recent
   successful runs on the default branch, plus the slowest jobs.
2. Change **one** thing that can reasonably cut time: caching,
   parallelism, job order, avoiding duplicate installs. Do not drop
   checks.
3. Rerun CI, or wait for a comparable run on the branch, and record
   the new total and per-job times.
4. Keep the change only if the measured time fell and the same
   required checks still ran and passed. Otherwise revert and try a
   different change.
5. Stop when the target is met, or after three attempts with no
   improvement, and hand the measurements to a human.

## Exit criterion

A PR whose CI on a comparable run is at or under the target, with
the same required checks still present and green, and a table of
before/after job times. Or an escalation with that table and no
further attempts.

## Max iterations

3 optimization attempts that produce a measured rerun, then stop if
the target is still missed.

## Guardrails

All shared guardrails, plus speed-specific ones:

- Do not delete, skip, or shard-away tests in a way that reduces
  coverage to hit the target. Do not set `continue-on-error` on
  required jobs, and do not remove required status checks.
- Do not raise timeouts and call that a speed win.
- Do not commit large generated caches into the repo.
- Compare like with like (same branch class, not a cancelled or
  failed run vs a successful one).
- Independent reviewer confirms the workflow still runs the same
  gates.

## PR output

Shared format in [SKILL.md](../SKILL.md), plus:

```markdown
### Timings
Target: <n> min
Baseline (run <url>): <n> min
After (run <url>): <n> min
Slowest jobs before → after:
- <job>: …
What changed: one short paragraph
Checks still required: yes
```

## How to wire

- **Cursor Automations.** Weekly scheduled trigger, repository
  attached
  ([Automations](https://cursor.com/docs/cloud-agent/automations)).
- **GitHub Actions.** Weekly `schedule` on the default branch
  running `anthropics/claude-code-action@v1` with `--max-turns`
  ([docs](https://code.claude.com/docs/en/github-actions)).
- **Claude Code scheduled task.** Weekly schedule; the prompt tells
  Claude to read timings with `gh run view --json jobs`
  ([Scheduled tasks](https://code.claude.com/docs/en/routines)).
- **Headless.** `claude -p` with `--bare` and `--max-budget-usd`
  ([Headless](https://code.claude.com/docs/en/headless)).
