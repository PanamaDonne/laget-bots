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

## Riktig modell

Samma kommando anropar en riktig modell när leverantörens nyckel finns i miljön. Nyckeln läses bara därifrån och syns inte i utskrift eller fel. Utan nyckel stannar körningen på mock.

```bash
BERGET_API_KEY=... npm run team -- example-team.json "Bygg en funktion"
```

`example-team.json` väljer Berget och varje agents modell. Byt med `--provider <id>` och `--model <id>`. Tokentaket (`maxTokens`, `--max-tokens`) stoppar körningen även här.

Leverantörer: Berget (`BERGET_API_KEY`), Mistral (`MISTRAL_API_KEY`), Grok (`XAI_API_KEY`, non-EU) och OpenAI (`OPENAI_API_KEY`, non-EU).

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` runs all three
