---
name: mr-audit-code
description: >-
  Use when a pull request or branch needs an audit of structure, requirements,
  overengineering and rule violations rather than nitpicking. Gives Approved /
  Changes required / Risks bound to the exact head SHA.
---
# Code audit (audit, not nitpicking)

Method: [Code Review in the Age of AI: From Review to Audit](https://hackernoon.com/code-review-in-the-age-of-ai-from-review-to-audit). Agent-written code has few small bugs and a few large ones. Review how the change is written, and propose rule updates so the next agent does not repeat the mistake.

**Rules:** the repo's `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, project docs (spec, API, engineering, tasks, design) and the PR template, where present. A missing rule that should exist is a finding.

## Independence

Run in a fresh session, not in the conversation that wrote the code. If the author's model family is known (for example Claude, GPT, Composer, Grok), use a different family — same-family reviewers share blind spots ([vanducng, 10 Nov 2026](https://vanducng.dev/2026/11/10/running-a-coding-agent-fleet-part-1-foundation-day/)). Do not trust the author's "tests are green": re-run the relevant tests or read CI yourself. A required proof that is missing is a finding, not a pass.

The verdict applies only to the head SHA and the exact diff you read. New commits after approval are reviewed as a range against the last reviewed SHA. If the diff changes, the verdict is stale.

## Reading the PR

- Read the PR, diff, files and CI through the host's tools. Don't clone.
- Note the head SHA.
- Require green CI (tests, lint, typecheck, secret scan, and any project workflows) before Approved. Missing CI is a finding.

## Five questions (in order)

1. **Size:** One idea? A large diff with an unclear core should be split. Ask for one change per PR. Flag oversized diffs ([Zest, 4 Nov 2026](https://meetzest.com/blog/claude-code-best-practices): in their reviews, PRs under 100 lines were flagged 11% of the time; PRs of 1,000–2,999 lines 57%). Mechanical repetition (renames, generated data) and lockfiles or assets do not count as too large.
2. **Requirements:** Does it do what the issue, PR text and spec say? Docs or PR text that promise more than the code does (including security claims) is a finding. If docs and running code disagree, that is a finding.
3. **Overengineering:** New modules, storage layers, flags or abstractions that existing code already covers? Custom engines or state libraries the stack already provides?
4. **Structure:** Wrong layer, silent behavior change, two sources of truth, unscoped storage, errors and timeouts handled inconsistently, or UI that looks like an action but does nothing.
5. **Rule violations:** Does it break the repo's rules?

## Stack checks (run those that apply)

- **TypeScript:** `strict`, no `any` / `@ts-ignore` without justification, typed boundaries (APIs, route or scene data, env).
- **Secrets:** no service-role keys, AI keys or `.env` in the repo or the client bundle. Only public, anon or publishable keys on the client.
- **Web:** only public env vars in the bundle (`NEXT_PUBLIC_`, `VITE_`, and equivalents); asset paths match hosting; reasonable bundle size.
- **Mobile / React Native / Expo:** follow the SDK and dependency versions in the repo; request only the permissions the feature needs; touch and scaling work on small screens; audio starts only after user interaction; accessibility labels on interactive and status-bearing elements; UI text in the language the repo specifies.
- **Games / real-time UI:** listeners, timers, tweens and input are removed on shutdown or destroy; movement and logic use `delta`, not frame counts.
- **Media:** user media is never saved, logged or uploaded outside the approved flow. Capture with EXIF stripped where the platform allows it. Temporary files are deleted on continue, retry, unmount and error (`finally`). No image bytes or base64 in logs.
- **API contracts:** the app follows the repo's API docs (status codes, empty results, auth requirements).
- **Supabase, auth, Edge Functions, network or secrets:** also run `mrs-security`. Never trust client-submitted scores, roles or permissions without a server check.

## UI evidence

Do not approve UI or interaction changes from reading the code alone. Require a screenshot or a run on a simulator/device (or a small-screen browser) that shows the acceptance criterion ([Gonza Gomez, 9 Nov 2026](https://ggomez.dev/blog/claude-code-agent-team)).

## Prove the tests can fail

A green test only counts if you know it can go red. For a bug fix or a new behavior, require a red/green pair from the author: the same test failing without the fix and passing with it, shown as captured output or a CI run on a test-only commit before the fix commit. You stay read-only, so if the pair is missing, ask for it; a missing pair is a finding, and a test that also passes against the bug is not coverage. Agents asked to "add tests" after the code tend to write tests that describe what the code does, bugs included ([Patrick Vieira, 8 Oct 2026](https://patrickjv.com/writing/gating-agent-written-code); [Lucas Firmo, 8 Oct 2026](https://www.bitswithlucas.com/blog/ai-agents-on-production-code/)). Skip this for pure refactors, renames and UI-only changes, which need UI evidence instead.

## Know the reviewer's limits

An AI review is one input to the merge decision, not the gate. On CR-Bench (584 PRs seeded from SWE-Bench defects), the best review agents found about one in three known defects, and a commercial reviewer whose comments were judged useful 78% of the time found 8.1% of them ([Pereira et al., Nutanix, Nov 2026](https://arxiv.org/abs/2611.02566v2); Python-only, LLM judges). SWE-PRBench, an independent benchmark built from human review comments, found 15–31% of human-flagged issues ([Kumar, Mar 2026](https://arxiv.org/abs/2603.26130)). So:

- A clean verdict means "nothing found", never "no defects". Say so in Risks when the diff touches money, auth, data deletion or migrations.
- Before you trust a reviewer setup (this skill, a model, a bot), calibrate it: replay 5–10 already-merged PRs whose bug was later fixed (or revert the fix on a scratch branch), run the review, and count how many of those known defects it names. Re-run when the model or this skill changes. Judge it on found defects, not on how useful its comments sound.
- After the first pass, do one self-critique pass: re-read your findings against the diff, drop the ones you cannot point to a line for, and look again for what you missed. CR-Bench found this raised both detection and usefulness for every model tested.

## Read, then ask

Why does the module exist, what happens on error, timeout, disconnect or backgrounding, what is stored and where, when is it cleared, what does a feature flag actually turn off, and what did the issue ask for compared with what shipped? If intent is unclear, ask the developer a concrete question.

## Severity

- **blocking:** wrong behavior, data leak, media persisted outside the approved flow, docs that lie, or too large to review
- **should fix:** structural or rule violations that will repeat
- **nit:** only if actually wrong, not style

## Reviewer is read-only; cap fix rounds

Do not edit, push, merge or fix the code. After findings, the author addresses them and you review the new SHA. After three rounds without Approved, stop, keep the open findings and escalate to the user. Do not start a fourth fix loop. Some failures are spec problems, not code problems ([Gonza Gomez, 9 Nov 2026](https://ggomez.dev/blog/claude-code-agent-team)).

## Output (in the user's language, short)

```markdown
### Verdict (head <sha>)
Approved | Changes required | Risks – one sentence why.

### Comments
#### 1. `path` Lnn – blocking | should fix | nit
What is wrong and what to change.

### Rule updates
- `AGENTS.md`: … (1–2 lines; the developer commits)

### Good
- …
```

Approve only on the exact SHA, with no blocking findings and green CI. Merge only after the user has approved.
