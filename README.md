# Radio Days

Radio Days är en röstagent i en gammal radio på en Raspberry Pi 4 Model B. Specen är [SPEC.md](SPEC.md) (v2.0).

Radion lär sig användarens vanor och kan agera på dem på egen hand. Vanedata stannar på Pi:n. Användaren kan stänga av den autonomin, och kan rätta eller radera en vana. Detaljer finns i [SPEC.md](SPEC.md).

Teammotorn från Laget Bots är avstängd. Repot behåller TypeScript, CI, hemlighetsskanning, licensen och synk av skills.

## Milstolpe 1

`npm run radio` lyssnar efter ”Kör Radio” och svarar på svenska. Ljudenheten står i `radio-days.config.json` under `audioDevice`. Samma kod och övrig konfiguration används på datorn, i en Linux-container och på Pi 4.

Direktsvar mot en chattmodell kräver ett uttryckligt val: `npm run radio -- --live`. Nyckeln läses från `RADIO_DAYS_API_KEY`. En nyckel i miljön utan `--live` startar inget betalt anrop. Modellen väljs med `RADIO_DAYS_MODEL` och `RADIO_DAYS_PROVIDER_BASE_URL`. Priset inklusive moms, i öre per miljon token, sätts med `RADIO_DAYS_ORE_PER_MILLION`.

Lokal taligenkänning är KB-Whisper base (`KBLab/kb-whisper-base`). Rösten är Piper `sv_SE-nst-medium` och ligger kvar i minnet mellan svar. `scripts/voice-worker.py` behöver `faster-whisper` och `piper-tts`, och röstfilen `models/sv_SE-nst-medium.onnx`. Testerna använder mockar och anropar inte modellerna.

`npm run latency-report` skriver svarstid. `sh scripts/precheck-container.sh` kör samma kontroll i en container med 4 kärnor och 2 GB minne. Det är en grov förhandskoll. Den är inte 3-sekundersmätningen. Den görs på en riktig Pi 4 i PAN-300.

Kräver Node 24.

## Kontroller

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` kör alla tre
- `npm run sync-skills` hämtar skills från `~/Desktop/skills`
