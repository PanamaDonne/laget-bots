# Laget Bots

A simple engine for a team of agents that collaborate on one goal.

Requires Node 24.

## Team run

`npm run team` loads a team config and prints a mock run. It needs no API key and does not call a model.

```bash
npm run team -- example-team.json "Bygg en funktion"
```

The output shows each handoff, question and answer, and when an agent finishes. A reply that cannot be parsed stops the run and prints the error.

Every run stops at a token cap, default 100000, or `tokenTak` in the team file. The shared context keeps a fixed window of recent entries (`maxAntalPoster`, `maxTeckenPerPost`) so later steps do not send a longer prompt. `maxTurns` limits turns, not model calls or cost.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` runs all three
