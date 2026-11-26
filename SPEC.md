# Laget Bots — spec v1.0 (Cursor spec)

Source of truth: Linear issue PAN-267. Keep this file and PAN-267 in sync.

Name: Laget Bots. Repo: [https://github.com/PanamaDonne/laget-bots](https://github.com/PanamaDonne/laget-bots). Owner: Daniel Hansson. PO: Jörgen. Date: 2026-11-25.

## 1. What it is

A super-simple engine for a team of agents that collaborate. Each agent has a role and a chosen model. Together they work on a goal: they share context, hand work to each other, can ask each other, and a human approves writes. It is framework-agnostic and uses no mobile app.

What makes the collaboration reliable (building blocks, not the product itself):

1. **Roles and a chosen model per agent.** The user plugs in their own key and any OpenAI-compatible provider. EU and Swedish providers come first and are the defaults.
2. **Handoff contracts.** When work is handed from one agent to another, a contract checks that no field or fact is lost. The gap this fills: LangSmith, Langfuse and OpenAI traces log *who handed to whom*, not *whether the content survived*.
3. **Permissions and human approval.** Every agent declares what it may read and write. Every write goes through a human approval first.
4. **Tracing and evals built in.** OTel traces, replay of a run against another model, and evals as a CI gate, including the MAST failure modes FM-1.4 (loss of conversation history), FM-2.4 (information withholding) and FM-2.5 (ignored other agent's input).

**Product principle: super simple.** It should feel as easy to use as Grok Bot. Setting up a team of agents takes minutes. Sensible defaults mean it works once you plug in a model key. Roles are set up in plain language. Approvals are shown clearly in plain words. No infrastructure knowledge is needed.

**First test bench:** a development flow where a PO agent, a dev agent and a reviewer agent work together on one change, with human approval before merge.

**User value:** Daniel can get an agent team running in minutes, pick the models he wants (EU and Swedish first), and show agents working together on a goal. Writes are approved, facts are not lost between agents, and regressions are caught in CI. That makes it a portfolio piece for AI product roles, and a base for his own agent team.

## 2. Core concepts

| Concept | Meaning |
| -- | -- |
| Team | A group of agents with roles and chosen models, working together on one goal. |
| Agent | Role, system prompt, model (provider + model id), tools, permissions. Set up in plain language, with a config file behind it. |
| Shared context | What the team knows about the current goal and what has been done so far. |
| Ask | An agent can ask another agent for clarification or input before continuing. |
| Provider | An OpenAI-compatible endpoint + API key from env. The user brings their own key and can add any OpenAI-compatible provider. EU and Swedish providers are listed first and used as defaults: Berget (Swedish, `https://api.berget.ai/v1`) and Mistral (EU). Non-EU providers such as Grok (`https://api.x.ai/v1`) are allowed and clearly marked as non-EU. |
| Handoff contract | A building block for reliable collaboration: a schema (Zod or JSON Schema) for what one agent hands to the next, plus a list of *must-carry facts*. |
| Contract check | Validates the schema, then checks that every must-carry fact from the input still exists in the output (deterministic first, judge model only for paraphrased facts). A failed check stops the run, or retries once, as configured. |
| Permission | Per agent: which resources it may read or write (files, issues, PR, memory). Denied by default. |
| Pending write | Every write becomes a pending action that a human approves or rejects. It is shown in plain words: what will be written, by which agent, and why. Nothing is written without approval. |
| Trace | One OTel trace per run, one span per agent step, handoff, tool call and approval. |
| Replay | Re-run a stored trace with another model on one or more agents and compare the results. |
| Eval | A test set of runs with expected outcomes, run in CI as a gate. |

## 3. Requirements v1

### 3.1 Roles and models

* The user brings their own key. Any OpenAI-compatible provider can be added (endpoint + key).
* EU and Swedish providers are listed first and are the defaults: Berget (Swedish), then Mistral (EU).
* Non-EU providers are allowed and clearly flagged as non-EU, including Grok.
* With one default (EU or Swedish) key, the test-bench team is ready to run. Changing an agent's model is a setup change, not a code change.
* Keys are only read from env. Secrets never go in config, code or traces.

### 3.2 Collaboration

* A team of agents works together on one goal. They share context, hand work to each other, and can ask each other.
* Handoff contracts, permissions with approval, and traces with evals are how that collaboration stays reliable.

### 3.3 Setup and everyday use

* Setting up a team of agents takes minutes, in plain language, through a guided setup. No infrastructure knowledge is needed.
* Approvals are shown in plain words in a simple local UI (the CLI remains available).
* v1 includes that simple local UI for setup, runs and approvals. A full dashboard or hosted admin UI is out of scope (see 3.7).

### 3.4 Handoff contracts

* A handoff without a contract is not allowed.
* The contract check logs which field or fact was lost, and in which step.
* FM-1.4, FM-2.4 and FM-2.5 are reported as their own eval metrics.

### 3.5 Permissions and approval

* A tool call outside the agent's permissions is denied and logged, never executed.
* No write happens without human approval. This must hold 100 % in evals.
* In the test bench, merge requires both the reviewer agent's verdict and human approval.

### 3.6 Tracing and evals

* OTel spans, exportable over OTLP. In v1 they are also stored in our own database so we can replay them.
* Replay works per agent: "run the same trace, but with Berget for the reviewer".
* Evals run in CI and fail the build when a threshold is not met.

### 3.7 Out of scope for v1

* A full dashboard or hosted admin UI (v1 has a guided setup and a simple local UI only).
* Mobile.
* Parallel agents (v1 is sequential: one agent works at a time, including when it asks another).
* More test benches than the dev flow.

## 4. Test bench: dev flow

A PO agent, a dev agent and a reviewer agent work together on one change:

1. **PO agent** turns a short goal into an issue: goal, user value and done criteria.
2. **Dev agent** gets the issue through a contract, can ask the PO if something is unclear, and suggests a change (a diff in a sandbox repo).
3. **Reviewer agent** gets the issue and the diff through a contract, can ask the dev or the PO, and gives a verdict (Approved / Changes required / Risks) using `mr-audit-code` and `mrs-security`.
4. **Human** approves or rejects the merge.

The contract between PO and dev must carry every done criterion. The contract between dev and reviewer must carry the issue's done criteria and the diff. A done criterion that disappears counts as FM-2.4.

## 5. Evals

| Eval | Metric | Gate |
| -- | -- | -- |
| Contract survival | Share of must-carry facts that survive every handoff | ≥ 95 % |
| FM-1.4 / 2.4 / 2.5 | Count per failure mode over the test set | Must not get worse than main |
| Approval safety | Writes without approval | 0 (100 %) |
| Permissions | Denied calls that were executed anyway | 0 |
| Reviewer quality | Planted bugs found in the test set | Threshold set after the first baseline |

The test set has 20–30 dev-flow cases in v1, some with planted bugs and some with deliberately lossy handoffs. The thresholds above are suggestions and get set once we have a first baseline.

## 6. Agent rules and skills

* `AGENTS.md` follows `agents-md-maintenance`: short, commands for test, typecheck and lint, and decisions not visible in the code.
* **Skills source:** Daniel's `~/Desktop/skills` is the master copy. The project uses those skills under `.cursor/skills/` in the repo (cloud agents only see skills in the repo).
* **Adapted to the project:** project-specific adaptations live separately from the master text (for example a project section or file per skill), so an update from the master never overwrites them.
* **Kept in sync:** when a skill changes in `~/Desktop/skills`, the project's copy is updated too. A sync command in the repo, `npm run sync-skills`, copies the master versions in and keeps the adaptations. The repo records which master version each skill comes from, so it is visible when a project skill is out of date.
* **Who updates:** when Daniel and the team agree on a skill change, Agent-Ante updates the master in `~/Desktop/skills`. The change reaches the repo through `npm run sync-skills` in a normal PR (Vera reviews, Lazek QA, Daniel merges). Project adaptations are never changed by Agent-Ante without agreement.
* Skills used:
  * `mr-audit-code`: reviewer agent and human PR review.
  * `mrs-security`: permissions, secrets, approval.
  * `agents-md-maintenance`: keep `AGENTS.md` short.
  * `agent-loops`: the dev flow is a bounded loop with a cap, a check and a human at the end.
* Done when: changing a skill in `~/Desktop/skills` and running the sync updates the project's skill, with its adaptations intact.
* GitHub is connected to Linear: every branch and PR title contains the Linear issue id (e.g. `PAN-254`, use Linear's copied branch name) so the PR links to the issue and its status follows the PR.
* Daniel builds in Cursor and opens a PR. Vera (code review) and Lazek (QA, same sha, CLI and local UI in a real browser) review and test every PR and always post their verdict (with sha) as a comment directly in the PR. Only Daniel merges.
* Done criterion for all code issues: covered by unit tests, CI green, Vera approved and Lazek QA on the same sha before merge.

## 7. Plan v1 (milestones, no fixed timeline)

The plan takes the time it takes. Each milestone is done only when its done criterion is met, not when a date passes.

**Milestone 1: engine core**

* Repo on GitHub, TypeScript, `AGENTS.md` and skills, CI with typecheck, lint and tests.
* Guided setup with sensible defaults: one model key is enough to run the test-bench team.
* Config for agents and providers. One client for any OpenAI-compatible API, verified first against Berget and Mistral, and also against a non-EU provider (Grok), which is flagged as non-EU.
* Several agents work together on one goal: they share context, hand work to each other, and can ask each other.
* Handoff contracts with schema and must-carry facts, plus the contract check, so collaboration does not lose facts.
* Done when: after a short guided setup with only a model key, several agents work together on one goal in a visible team run, and a lost fact in a handoff is caught in a unit test.

**Milestone 2: permissions, approval, traces**

* Permissions per agent, denied by default.
* Pending writes with approval in plain words in the simple local UI (CLI still available).
* OTel spans per step, stored and exportable.
* Done when: the whole dev flow runs end to end with approval before merge, and one trace can be replayed with another model.

**Milestone 3: evals and CI gate**

* Test set of 20–30 cases.
* Eval runner with contract survival, MAST metrics, approval safety and reviewer quality.
* CI gate on PRs. A short README with a demo.
* Done when: CI turns red on a planted contract break and green again when it is fixed.

## 8. Running cost (estimate)

**Infrastructure: 0 SEK/month in v1.** The engine is a library + CLI and a simple local UI. It runs locally and in GitHub Actions (free minutes for public repos; private repos have a free quota). Traces go to Supabase Free in the EU if we need storage beyond files. Assumption: free projects pause after about a week of inactivity.

**Models:** the user brings their own key and pays the provider they choose. The figures below are a reference, using Mistral list prices (checked 2026-11-25 on [Mistral's pricing page](https://docs.mistral.ai/inference/pricing)):

* Mistral Small 4: $0.15 in, $0.60 out per million tokens.
* Mistral Large 4: $0.70 in, $2.10 out per million tokens.
* Berget and Grok prices are not checked yet. That gets done in milestone 1, before the cost is locked.

**Assumption per dev-flow run:** about 60k input and 10k output tokens across three agents.

* Small 4 on all agents: about $0.015 per run.
* Large 4 on all agents: about $0.06 per run.

**Example month (assumption):** 20 PRs × 30 eval cases = 600 runs, plus 100 manual runs and replays.

* Small 4: about $10 per month.
* Large 4: about $45 per month.
* Mixed (Small for PO and dev, Large for reviewer): somewhere in between.

To keep costs down, CI runs the full eval only on PRs that touch engine code or prompts, and a small smoke set otherwise. There is also a token cap per run. With the 10 USD/month cap, CI uses Mistral Small 4 by default and stops paid eval runs when the monthly budget is used up (the gate then fails clearly, it does not pass silently).

## 9. Decisions and open questions

**Decided (2026-11-25):**

* Agent-Ante updates the master skills after an agreed change; the repo gets them via sync in a PR.
* Daniel builds in Cursor; Vera reviews and Lazek QA-tests every PR before Daniel merges.
* Skills come from `~/Desktop/skills`, are adapted to the project, and are synced into the repo when the master changes.
* Name: Laget Bots.
* Language: TypeScript for engine and local UI. Contracts in Zod as the source, exported to JSON Schema so other languages (for example a later Python client) can use them.
* The core is agents that collaborate on a goal. Handoff contracts, permissions and approval, and tracing and evals are building blocks that make that collaboration reliable.
* Open source from the start.
* CI may call paid models, capped at 10 USD per month in total.
* v1 dev flow runs against a sandbox repo only.
* v1 UI: a guided setup plus a simple local UI for setup, runs and approvals in plain words. A full dashboard stays out of scope.
* No fixed timeline; the plan is milestones with done criteria.
* TypeScript, framework-agnostic, no mobile first.
* Super simple to use, like Grok Bot: setup in minutes, sensible defaults, plain-language roles and approvals, no infrastructure knowledge needed.
* The user plugs in their own key and any OpenAI-compatible provider. EU and Swedish providers are listed first and are the defaults (Berget, then Mistral). Non-EU providers such as Grok are allowed and clearly flagged as non-EU.
* The first test bench is the dev flow. Agent-Ante's four skills are used.

**Open:** none right now.
