# Laget Bots

A simple engine for a team of agents that collaborate on one goal.

Requires Node 24.

## Team run

`npm run team` loads a team config and prints a mock run. It needs no API key and does not call a model.

```bash
npm run team -- example-team.json "Bygg en funktion"
```

The output shows each handoff, question and answer, and when an agent finishes. A reply that cannot be parsed stops the run and prints the error.

Every run stops at a token cap, default 100000, or `maxTokens` in the team file. Override it with `--max-tokens <antal>`. The shared context keeps a fixed window of recent entries (`maxContextEntries`, `maxEntryChars`) so later steps do not send a longer prompt. `maxTurns` limits turns, not model calls or cost.

## Real model

The same command calls a real model only when you pass `--live` or `--provider <id>`, and that provider's API key is set in the environment. `--provider <id>` is an explicit choice, the same as `--live`. The key is read only from the environment and is never printed. Without that choice, or without the key, the run stays on the mock. `--live` with no provider in the team file and no `--provider` stops with an error and does not call the network.

`--provider <id>` without `--model` uses that provider's default model when the team file names a different provider: Berget `google/gemma-4-31B-it`, Mistral `mistral-large-4-0`. Grok and OpenAI have no default model, so the command stops until you pass `--model <id>`. A model you pass with `--model` is sent as given.

A real run sends the goal to the provider and costs money. Grok and OpenAI are non-EU. The success line says `(mock)` or `(live, <provider>)`.

```bash
BERGET_API_KEY=... npm run team -- example-team.json "Bygg en funktion" --live
```

`example-team.json` selects Berget and each agent's model. Change them with `--provider <id>` and `--model <id>`. The token cap (`maxTokens`, `--max-tokens`) still stops the run.

Providers: Berget (`BERGET_API_KEY`), Mistral (`MISTRAL_API_KEY`), Grok (`XAI_API_KEY`, non-EU) and OpenAI (`OPENAI_API_KEY`, non-EU).

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` runs all three
