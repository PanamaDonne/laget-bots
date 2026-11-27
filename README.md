# Radio Days

Radio Days är en röstagent i en gammal radio på en Raspberry Pi 4 Model B. Specen är [SPEC.md](SPEC.md) (v2.0).

Radion lär sig användarens vanor och kan agera på dem på egen hand. Vanedata stannar på Pi:n. Användaren kan stänga av den autonomin, och kan rätta eller radera en vana. Detaljer finns i [SPEC.md](SPEC.md).

Teammotorn från Laget Bots är avstängd. Repot behåller TypeScript, CI, hemlighetsskanning, licensen och synk av skills. Produktfunktionerna i specen är inte byggda än.

Kräver Node 24.

## Kontroller

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` kör alla tre
- `npm run sync-skills` hämtar skills från `~/Desktop/skills`
