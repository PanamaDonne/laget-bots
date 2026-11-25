---
name: agents-md-maintenance
description: >-
  Use when adding to, trimming, or reviewing AGENTS.md, CLAUDE.md or equivalent
  agent instructions, or when a rule has been repeated or ignored and needs a
  better home (the file, a skill, a diff-triggered review checklist, or a hook).
---
# Keep AGENTS.md short

`AGENTS.md` (and `CLAUDE.md`, if present) loads into every session, so every line costs attention on every task. Anthropic's test for a line, as summarized by [Zest, 4 Nov 2026](https://meetzest.com/blog/claude-code-best-practices): the agent could not work it out from the code. Keep the shared file under 200 lines, commit it, and review changes to it like code.

## What belongs here

Only these four kinds:

- **How to confirm work:** exact test, typecheck and lint commands, including how to run a single test file. Give the agent a check that returns pass or fail so it can iterate without you as the test suite.
- **Where the code misleads:** an old pattern new code must not copy.
- **Decisions that are not in the repo:** how deploys work, what needs a migration review.
- **Anything you have had to correct twice.**

You do not need to describe architecture or file layout; the agent reads the repo.

## What does not belong here

- Long procedures (release steps, incident runbooks, review playbooks) go in a skill under `.cursor/skills/<name>/SKILL.md` (or the repo's skill path). A skill loads only when the task needs it.
- Rules that must not bend go in a hook, a deny rule or a managed setting — not in stronger wording. If you keep adding emphasis and the line is still missed, it belongs in a hook. Branch protection is the real guard for the default branch.
- Personal preferences go in a gitignored local file (`CLAUDE.local.md` or equivalent), not in the shared instructions.

## What the research says

An ETH Zurich study across four agents found that context files did not significantly raise task success but raised cost by about 20%. LLM-generated files did slightly worse than having none; developer-written ones did slightly better (about 2 percentage points, not significant), and significantly better than LLM-generated ones. Repository overviews did not help agents find the right files ([Gloaguen et al., 2026](https://arxiv.org/abs/2602.11988)). A smaller Codex-only study found shorter runtimes and fewer output tokens with AGENTS.md, but did not measure correctness ([Lulla et al., 2026](https://arxiv.org/html/2601.20404v2)). Both used Python repos. Take it as: few, human-written, specific lines; no overviews; measure before you add more.

## How to word a rule

Write each rule as a direct instruction, optionally with the reason: "Add X to every Y you change" or "Add X to every Y you change, because Z". Avoid "If you change Y, add X". A NAIST study put one checkable rule, in four wordings, into the AGENTS.md of 86 benchmark tasks across four harness-model pairs. Where wording mattered (three of four pairs), the conditional version was followed less often than the direct one and the one with a reason; on Claude Code with claude-opus-5 that was 64.2% vs 78.0% and 77.2%. Whether the direct or the explained version did best varied by model ([Tsuchida et al., Nov 2026](https://arxiv.org/abs/2611.04367)). Limits: one rule, one sentence per style, Python only, not yet peer-reviewed. Even the best wording was missed in more than one session in five there, so a rule that must hold still belongs in a hook or CI check (see above). This applies to instructions a builder must follow on its own; the diff-triggered checklist below is different, because a reviewer is told to match each trigger explicitly.

## When you edit

- Agents (reviewers, QA bots, `/init`) may propose lines, but a human writes or approves the final wording. Do not let an agent append to the file unreviewed.

- Add a recurring mistake only after it has been corrected twice, in one or two lines, with the wrong pattern and the required one.
- Before adding a paragraph, check whether an existing line already covers it, and whether the agent could see it in the code or in a skill.
- Delete guidance the agent now consistently follows, and hooks that only enforce preferences.
- Put a runnable pass/fail check in the file if one is missing (the exact command the agent should run before it calls the work done).

## Recurring review findings: a diff-triggered checklist

When reviewers or QA agents keep logging the same kinds of mistakes, do not let them pile up as prose in `AGENTS.md`. Move them to a separate checklist the reviewer reads (for example `REVIEW.md` or a section of the review skill). Each item has three parts:

- **Trigger:** something you can see in a diff (for example "a migration adds a table", "a stored message type gets a new field").
- **Check:** what the reviewer must confirm when the trigger matches.
- **Source:** the PR, revert or incident it came from.

The reviewer matches triggers against the diff and runs only those items, so the list can grow without loading every line into every task. The Claude Code team runs a 39-item list like this and usually checks 3 to 10 per PR ([claude.dev, 16 Nov 2026](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/)).

Before an item is added:

- The pattern has shown up in at least two PRs and can be spotted from a diff.
- Other agents try to disprove it (false positives, already covered, not detectable from a diff); the Claude Code team uses three.
- A human approves the wording in a PR.

Read the checklist from the base branch, not from the PR under review, so a change cannot edit the rule that judges it. Prune items that no longer fire or that a lint, test or hook now enforces. Treat this as one team's practice, not measured evidence: there is no independent study of diff-triggered checklists yet.

## Multi-agent teams: hand off through artifacts

If several agents work in the repo (for example PO, frontend, backend, reviewer, QA), add a short handoff rule. Copy and adapt the role names:

```markdown
## Handoffs
Handoffs go through artifacts, not free chat: PO writes the issue with goal and exit check -> FE/BE write a plan in the issue, then a PR -> reviewer reviews the PR on the exact head SHA -> QA tests the same SHA -> a human merges. Key decisions go in the issue or PR, not only in chat. Only one agent writes to a branch at a time.
```

Why: in a benchmark of simulated team tasks, eight agents with a shared message board did no better than eight that could not talk (0.42 vs 0.44) at roughly nine times the cost of one agent ([Bespoke Labs MAC Bench, 18 Nov 2026](https://benchmarks.bespokelabs.ai/multi-agent-coordination-bench)). The tasks were not coding, and the result is not yet replicated; lead-plus-subagent setups can pay off on broad, parallel work ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). Treat it as a default, not a law.

## Cloud Agents

Cursor Cloud Agents pin as a mode only skills that live in the repo they are working on. Marketplace or machine-local skills can appear in the menu but are dropped on Cloud. After changing a skill, copy it to `.cursor/skills/<name>/SKILL.md`, commit and push, then start a new Cloud run ([Cursor forum, 8 Nov 2026](https://forum.cursor.com/t/cloud-agent-option-skill-does-not-enable-custom-mode-e-g-poteto-mode/177690)).
