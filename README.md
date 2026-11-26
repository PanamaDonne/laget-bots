# Radio Days

Radio Days är en röstagent i en gammal radio på en Raspberry Pi 4. Specen är [SPEC.md](SPEC.md) (v2.0).

Teammotorn från Laget Bots är avstängd. Repot behåller TypeScript, CI, hemlighetsskanning, licensen och synk av skills. Produktfunktionerna i specen är inte byggda än.

Kräver Node 24.

## Kontroller

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` kör alla tre
- `npm run sync-skills` hämtar skills från `~/Desktop/skills`
