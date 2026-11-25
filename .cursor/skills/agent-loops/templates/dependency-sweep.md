# Dependency sweep (upgrade, test, fix breaks)

Inspiration: [Moka, loop 5](https://craftbettersoftware.com/p/loop-engineering-9-ways-to-automate).
Follow the shared rules in [SKILL.md](../SKILL.md).

## Trigger

A weekly schedule, or a batch of open Dependabot / Renovate pull
requests waiting for someone to fix what broke.

## Inputs

- The list of open update PRs, for example
  `gh pr list --app dependabot` or `gh pr list --app renovate`.
- The repo's test, lint, and typecheck commands.
- Changelog or release notes for the package being upgraded.
- The repo's cooldown policy (see Guardrails).

## Steps

1. Pick **one** package (or one existing bot PR). Do not batch
   unrelated upgrades in the same change; a failure must point at one
   package.
2. Check the release age. For routine version updates, skip releases
   still inside the cooldown (see Guardrails). Security updates are
   a different loop: prefer [cve-burndown](cve-burndown.md).
3. Apply the upgrade on a branch (or take over the bot PR). Run the
   full relevant suite.
4. If tests fail, fix call sites or config for that package only,
   within three rounds. Do not skip tests. Do not pin a broken
   version and call it done.
5. If the suite is green, leave the PR open for a human. If it is
   still red after three rounds, comment with the failure and move
   on; do not merge.
6. Repeat for the next package only after the previous PR is either
   ready for review or escalated.

## Exit criterion

Each chosen package has either a green PR ready for review, or an
escalation comment with the failing command and log. The sweep is
done when the scheduled batch is empty or the budget is hit.

## Max iterations

3 fix rounds *per package*, then escalate that package and continue
with the next if budget remains.

## Guardrails

All shared guardrails, plus supply-chain rules:

- **No auto-merge.** GitGuardian observed Dependabot and Renovate
  opening and, in many cases, auto-merging a malicious `axios`
  release within an hour
  ([10 Apr 2026](https://blog.gitguardian.com/renovate-dependabot-the-new-malware-delivery-system/)).
  A human merges after review.
- **Cooldown on version updates.** Dependabot applies a default
  3-day cooldown to version updates (not to security updates),
  configurable with `cooldown.default-days`
  ([Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)).
  Renovate uses `minimumReleaseAge`
  ([upgrade best practices](https://docs.renovatebot.com/upgrade-best-practices/)).
  GitGuardian recommends 3–5 days for routine updates.
- Do not let the bot rewrite an immutable workflow SHA pin inside
  the same version tag
  ([GitGuardian](https://blog.gitguardian.com/renovate-dependabot-the-new-malware-delivery-system/)).
- Do not widen `[skip ci]` or remove required checks to land the
  upgrade.

## PR output

Shared format in [SKILL.md](../SKILL.md), plus package name, old and
new versions, release date / age, and whether this is a major bump.

## Optional coordinator

When the work splits into independent parts, a Cursor Project
coordinator may fan it out to cloud agents and assemble one PR. See
"Optional Cursor Project coordinator" in [SKILL.md](../SKILL.md). The
coordinator never merges.

## How to wire

- **Cursor Automations.** A scheduled trigger (weekly cron) with a
  repository attached, prompt pointing at this template
  ([Automations](https://cursor.com/docs/cloud-agent/automations)).
- **GitHub Actions.** `on: schedule` plus `workflow_dispatch`,
  automation-mode `anthropics/claude-code-action@v1` with
  `--max-turns` and a timeout
  ([docs](https://code.claude.com/docs/en/github-actions)).
  GitHub only runs scheduled workflows from the default branch.
- **Claude Code scheduled task.** Weekly schedule; the prompt starts
  from the open bot PRs
  ([Scheduled tasks](https://code.claude.com/docs/en/routines)).
- **Headless.** `claude -p` with `--bare` and `--max-budget-usd`
  ([Headless](https://code.claude.com/docs/en/headless)).
