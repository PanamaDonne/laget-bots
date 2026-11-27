# Radio Days

Radio Days är en röstagent i en gammal radio på en Raspberry Pi 4 Model B. Specen är [SPEC.md](SPEC.md) (v2.0).

Radion lär sig användarens vanor och kan agera på dem på egen hand. Vanedata stannar på Pi:n. Användaren kan stänga av den autonomin, och kan rätta eller radera en vana. Detaljer finns i [SPEC.md](SPEC.md).

Teammotorn från Laget Bots är avstängd. Repot behåller TypeScript, CI, hemlighetsskanning, licensen och synk av skills.

## Milstolpe 1

`npm run radio` lyssnar efter ”Kör Radio” och svarar på svenska. Ljudenheten står i `radio-days.config.json` under `audioDevice`. Samma kod och övrig konfiguration används på datorn, i en Linux-container och på Pi 4.

Direktsvar mot en chattmodell kräver ett uttryckligt val: `npm run radio -- --live`. Nyckeln läses från `RADIO_DAYS_API_KEY`. En nyckel i miljön utan `--live` startar inget betalt anrop. Modellen väljs med `RADIO_DAYS_MODEL` och `RADIO_DAYS_PROVIDER_BASE_URL`. Priset inklusive moms, i öre per miljon token, sätts med `RADIO_DAYS_ORE_PER_MILLION`. Sätt det till det högre av inpris och utpris.

Lokal taligenkänning är KB-Whisper base (`KBLab/kb-whisper-base`). Rösten är Piper `sv_SE-nst-medium` och ligger kvar i minnet mellan svar. Installera paketen med `pip install -r requirements.txt`. Första körningen hämtar KB-Whisper från Hugging Face till `models/`. Röstfilen `models/sv_SE-nst-medium.onnx` måste ligga på plats. Testerna använder mockar och anropar inte modellerna.

Efter ”Kör Radio” väntar radion högst tio sekunder och skickar högst ett yttrande till modellen. Tyst ljud skickas inte till taligenkänningen. Ett yttrande slutar vid första tysta biten efter ungefär en sekund, med tröskeln rms 500. Den tröskeln kan behöva justeras efter ett riktigt prov, för en kort paus kan klippa meningen. När ett svar har talats skrivs millisekunderna ensamma på standard error. `npm run radio -- --live` utan nyckel säger till redan vid start.

`sh scripts/precheck-container.sh` hämtar KB-Whisper base och Piper-rösten om de saknas, kontrollerar röstfilens sha256, och mäter i en gräns på 4 kärnor och 2 GB. Saknas systemd kan skriptet slå på cpu-styrning i den egna cgroup-föräldern och ta bort den igen efter körningen. Mätningen läser det inspelade yttrandet `test/fixtures/utterance-16k-s16le.pcm`, kör taligenkänning och röst lokalt utan nät, och anropar inte chattmodellen. `latencyMs` är tiden från att talet tar slut till att svarsljudet finns (`latencyKind` är `model`). Det är en grov förhandskoll. Den är inte 3-sekundersmätningen. Den görs på en riktig Pi 4 i PAN-300. Om gränsen inte går att sätta står det på standard error.

Kräver Node 24.

## Kontroller

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run check` kör alla tre
- `npm run sync-skills` hämtar skills från `~/Desktop/skills`
