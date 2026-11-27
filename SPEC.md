# Radio Days — product spec v2.1

Status: proposed. Direction decided by Daniel Hansson 2026-11-27; this spec becomes accepted when Daniel merges this PR. This file is opened as a pull request to replace [`SPEC.md`](https://github.com/PanamaDonne/radio-days/blob/main/SPEC.md) on `main`. Until that PR is merged, the accepted file on `main` remains v2.0 (Linear PAN-267, tightened in PAN-298). PAN-297 is absorbed here.

This revision drops the Raspberry Pi. An ESP32-S3 thin client talks to a house server (Daniel’s Mac mini) over the local network. Every backend part is swappable through a common provider interface. Local models and the provider interface are the rules in section 5 and section 6.

**Name:** Radio Days.
**Repo:** [https://github.com/PanamaDonne/radio-days](https://github.com/PanamaDonne/radio-days).
**Visibility:** the repo stays public. Secrets, keys, device identifiers, pairing keys and personal data must never appear in the code or the repository.
**Owner:** Daniel Hansson. **PO:** Jörgen.
**Date of accepted v2.0:** 2026-11-26.
**This revision:** 2026-11-27 (v2.1, ESP32-S3 thin client, Mac mini local-first).
**Language in the product:** code identifiers in English. User-facing language is the rule in section 2.2.

---

## 1. What it is

Radio Days is a voice agent built into an old cassette player. The user talks to the radio in English (section 2.2). The device is a thin client: an ESP32-S3, a microphone, and the cassette player’s own speaker. Wake word detection runs on the chip, with microWakeWord and a ready-made English wake word for the first demo (for example “Hey Jarvis”). A custom wake word (“Kör Radio”) and Swedish come later. After the wake word, the chip streams audio over a WebSocket on the local network to Daniel’s Mac mini, which runs speech-to-text, the language model, streaming text-to-speech, memory and scheduled agent jobs. Spoken replies stream back over the same WebSocket.

Every backend part is built behind a common provider interface. Configuration chooses the provider for each part. Local models and the provider interface are the rules in section 5 and section 6.

The core of the agent is getting to know the user, and acting on what it has learned. v1 is wake word, voice chat, long-term memory, web search that can also start web radio or music (“turn on P1”), a web admin served from the Mac mini, and proactive agent jobs.

**User:** in the first place Daniel, at home, speaking English to the radio. The household is one user.

**User value:** Daniel can walk up to an old cassette player, say the wake word, and talk with an AI that remembers him. He can ask it to search the web and to put on the radio. In the morning it can brief him and then turn the radio on. It can watch for things, remind him, suggest from what it knows, research a question, and sum up the evening. He sets it up, and can see and edit what it remembers, from any computer through the web admin (section 7). In the default local mode, speech and memory stay in the house.

**Product principle: super simple.** Talking to the radio should feel as easy as talking to a person in the room. No infrastructure knowledge is needed for everyday use.

**Build and run cheap.** One working radio unit should cost at most 500 SEK, including microphone and speaker. The Mac mini is existing household hardware and is outside that parts budget. Local models on the Mac mini have no hosted fee (section 10).

---

## 2. Scope

### 2.1 In scope for v1

1. **Wake word** on the chip, with **microWakeWord** and a ready-made English wake word for the first demo, for example “Hey Jarvis”. A custom wake word (“Kör Radio”) and Swedish come later. Optional push-to-talk remains a backup, not an approval. Choosing a wake word from a list in the web admin stays after v1 (Linear PAN-301).
2. **Voice chat.** Spoken conversation with one AI agent, in English, through the house pipeline: ESP32-S3 over the local WebSocket to the Mac mini (section 5).
3. **Memory that gets to know the user.** Long-term memory and learned habits live in Postgres with pgvector on the Mac mini. The user can view and edit what the radio remembers, by voice and in the web admin. A habit is not stored until the user agrees, by voice or in the web admin.
4. **Web search as an agent tool**, which can also start web radio or music (for example “turn on P1”). Search is via own SearXNG. SearXNG is not a model. Favourite stations are picked in the web admin. Station start is the rule in section 8.
5. **Calendar.** Google Calendar is a source for the morning broadcast and a connection in the web admin. Standalone “what is on my calendar?” by voice may use that same connection.
6. **Proactive agent jobs**, run by a local scheduler on the Mac mini by default (the Mac mini must be on around the clock for these jobs):
   * a morning broadcast with weather, Google Calendar and news, ending by turning the radio on
   * background watch (“tell me when …”)
   * context-aware reminders
   * proactive suggestions from memory
   * multi-step research
   * an evening summary
7. **Web admin**, in v1. Built in Next.js and **served from the Mac mini**. Sign-in is the rule in section 7. In it the user can: onboard and pair the device (Wi-Fi, device linking, and the pairing key); manage keys and connections such as Google Calendar; view and edit what the radio remembers; manage watches and reminders; pick favourite radio stations. Secrets are handled server-side or encrypted, and never placed in the public code. Memory stays at home. Vercel is not the host. Email is not in v1.

**Quiet hours and the unprompted cap (decided):** Unprompted means anything the radio says on its own initiative that the user did not ask for: proactive suggestions from memory and any self-initiated tips. These count toward the max of 3 per day, and none may be spoken in quiet hours 22:00–07:00 Europe/Stockholm. These do not count, because the user asked for them: the morning broadcast and evening summary the user has scheduled, reminders the user created, and watch alerts the user set up (“tell me when …”). The morning broadcast and the evening summary run at the times the user sets, and the admin refuses times inside 22:00–07:00. Unprompted announcements wait. Urgent is a per-item flag the user sets in the admin, and it is off by default. User-requested reminders and watch alerts are also held during quiet hours, unless the user marked them urgent in the admin.

Mail text (if email returns in v2), calendar invitations and events, and web search results stay untrusted. They are never treated as instructions and can never start an action.

A token cap per conversation remains. A provider key alone does not start a paid call; an explicit choice is required.

### 2.2 Out of scope for v1

* **Email**, including reading mail aloud and the unlock method. It was in the accepted v2.0 spec (PAN-302, PAN-307). It is parked until v2 (Daniel, 2026-11-27). A physical approval button is not required in v1; it returns with sending mail in v2.
* **Spotify**, including playlist and favourite changes. Web radio replaces it in v1. Spotify’s [Developer Policy](https://developer.spotify.com/policy) (III.3, effective 15 May 2025) forbids a voice-enabled app that controls Spotify without written permission. A later version requires that permission. If Spotify returns, playlist and favourite changes must be undoable.
* Swedish as the product language, and a custom wake word (“Kör Radio”). English is the v1 default. Swedish, including KB-Whisper for speech-to-text, is a later language option via the swappable providers.
* Raspberry Pi as the runtime, and on-device SQLite memory on the radio.
* A voice chain that does not run on the Mac mini, and a Vercel-hosted web admin as the default.
* Further work on the Laget Bots team engine. PR #13 and remaining Laget Bots stage-1 work stay paused.
* A local admin UI as a separate primary surface, and mobile apps.
* Secrets, keys, device identifiers, pairing keys or personal data in the repository — ever. The repo stays public.

Choosing the wake word from a list in the web admin remains after v1 (PAN-301). A custom wake word (“Kör Radio”) and Swedish come later.

---

## 3. What changes from the accepted v2.0 on `main`

The accepted spec on `main` is a voice agent on a Raspberry Pi 4 Model B. Speech-to-text is local KB-Whisper. Text-to-speech is local Piper. Memory is SQLite on the Pi. v1 is conversation, email, calendar and web search. Secrets and memory stay on the Pi. The running-cost cap is 99 SEK per month including VAT.

This revision changes that as follows.

| Area | Accepted v2.0 on `main` | This revision (v2.1) |
| -- | -- | -- |
| Hardware | Raspberry Pi 4 Model B. Parts goal about 800–1,200 SEK | ESP32-S3 thin client, at most 500 SEK for one working radio unit, including microphone and speaker, built into an old cassette player, reusing its speaker. House backend: Daniel’s Mac mini (M4, 16 GB), on around the clock |
| Wake word | openWakeWord on the Pi, phrase “Kör Radio” | microWakeWord on the chip, with a ready-made English wake word for the first demo (for example “Hey Jarvis”). A custom wake word (“Kör Radio”) and Swedish come later |
| Device link | The agent runs on the Pi | A WebSocket on the local network to the Mac mini. Pairing and encryption are the rule in section 5 |
| Backend | Everything runs on the Pi | A common provider interface; configuration picks the local model per part (section 5 and section 6) |
| Speech and model, default | Local KB-Whisper and local Piper on the Pi. Audio stays on the device | ESP32-S3 streams audio to the Mac mini. STT: Whisper or Parakeet, English. LLM: Qwen 2.5 7B or Llama 3.1 8B via Ollama or MLX, with tool calling. TTS: Piper with an English voice, or Kokoro. Speech stays in the house. KB-Whisper is the Swedish speech-to-text option later, not the v1 default |
| Memory | SQLite with sqlite-vec on the Pi | Postgres with pgvector on the Mac mini |
| Agent jobs | On the always-on Pi. Multi-step goal planning was out of v1 | A local scheduler on the Mac mini, which must stay on. Multi-step research is in v1 |
| Web search | A search service, vendor open | Own SearXNG (section 2.1) |
| Web admin | Next.js on Vercel; secrets and memory stayed on the Pi | Next.js served from the Mac mini. Sign-in is the rule in section 7. Memory stays at home |
| v1 capabilities | Conversation, email, calendar, web search | Wake word, voice chat, memory, calendar, web search plus web radio, proactive jobs, web admin. Email and language are the rules in section 2 |
| Quiet hours | Required, times unset | The decided rule in section 2 |
| Cost cap | 99 SEK per month including VAT, assuming local speech on the Pi at 0 SEK hosted | Local models on the Mac mini have no hosted fee |
| Latency | First audio within 3 seconds, measured on a Pi 4 in PAN-300 | First audio within 3 seconds, measured against the Mac mini, from the ESP32-S3 over the home network |
| When the Mac mini is unreachable | Not applicable | See section 4 |
| Chat provider | EU-hosted, pay-as-you-go | Local Qwen 2.5 7B or Llama 3.1 8B only |

Workflow is unchanged: TypeScript, `AGENTS.md`, CI, Vera and Lazek on every PR, only Daniel merges, no secrets in chat or code, live model calls only with Daniel’s yes.

In-flight work decided with this revision: PR #20 (PAN-308) will be merged and then adapted (Daniel merges). PR #21 (PAN-289) is stopped; the issue is rescoped. PAN-297 is absorbed in this file.

---

## 4. Hardware

The Raspberry Pi is out. The radio is an ESP32-S3 used as a thin client. The house backend is Daniel’s Mac mini (Apple M4, 16 GB).

* Radio budget: at most 500 SEK for one working unit, including microphone and speaker. The Mac mini is not part of that budget.
* Enclosure: an old cassette player that Daniel finds. The player’s speaker is reused.
* The component list for the radio is produced separately. It is not part of this spec.
* A desk or bench prototype of the same chip, microphone and a speaker is enough for software milestones until the cabinet is ready.
* After the wake word, the ESP32-S3 streams audio over the local WebSocket to the Mac mini, and plays streamed speech and web radio on the speaker.
* The Mac mini must be on around the clock for scheduled agent jobs. If it is unreachable, the radio says an error out loud.
* A simple status indicator (listening, thinking, idle) is still desirable. A physical approval button is not required in v1.

ATECC608 and locking a memory-database key in a chip on the radio no longer fit a thin client. They are dropped from v1 unless Daniel brings them back.

---

## 5. Architecture

The backend is built so that every part can be swapped through a common provider interface. Configuration selects the local model for each part. The provider interface swaps one local model for another. v1 models run on the Mac mini (section 6).

| Part | v1 (local, Mac mini) |
| -- | -- |
| Speech-to-text | Whisper or Parakeet, English |
| Language model | Qwen 2.5 7B or Llama 3.1 8B via Ollama or MLX, with tool calling |
| Text-to-speech | Piper with an English voice, or Kokoro |
| Memory | Postgres with pgvector on the Mac mini |
| Agent jobs | Local scheduler on the Mac mini |
| Web search | Own SearXNG (section 2.1) |

Swedish, including KB-Whisper and a Swedish voice, is a later language option through the same provider interface. It is not part of v1.

**Device and house server**

* **On the chip:** microWakeWord with a ready-made English wake word, microphone capture, a WebSocket client for audio in both directions, playback of streamed speech, and starting web radio on the speaker.
* **Discovery:** the radio finds the Mac mini via mDNS (`radio-days.local`) or a fixed IP.
* **Pairing:** a pairing key is set in the web admin. Both ends authenticate with that key. The device verifies that it is talking to the paired Mac mini with a pinned certificate or a challenge. The backend rejects a device that does not present the current key. The audio stream is encrypted (TLS or equivalent). Re-pairing from the admin rotates the key and revokes the old key. The key is never committed to the public repository or to committed firmware.
* **On the Mac mini, by default:** STT, the language model, text-to-speech, long-term memory, web search, the web admin (Next.js), and scheduled agent jobs.
* **Web admin access:** Next.js served from the Mac mini. Sign-in is the rule in section 7.

A provider key alone does not start a paid call; an explicit choice is required.

Whether Qwen 2.5 7B or Llama 3.1 8B is good enough in English with tool calling, and whether STT, the model and TTS can run at the same time in 16 GB while meeting the 3 second gate, is a measurement in milestone 6 / PAN-300. It is not a product decision in this file.

---

## 6. The agent, memory and proactive jobs

The radio gets to know Daniel. When it is confident enough in a habit, it may choose for him, and it asks only when it is unsure. He can turn autonomous behaviour off, and he can correct or delete a learned habit or a memory, by voice and in the web admin.

A habit is a pattern the radio detects itself. A memory is something the user explicitly asks it to remember. The radio does not invent personal facts. A deleted item is not used again.

**Household.** The household is one user. The radio does not distinguish people. Other people in the home can hear the radio and use it. Memory is per household. Anyone in the room can give consent and can delete a habit or a memory.

**Consent and retention (PAN-297).** The radio does not store a habit until the user agrees, by voice or in the web admin. Raw audio and transcripts are not stored by Radio Days, on the Mac mini or in the repo. Memory and habits live in Postgres with pgvector on the Mac mini. They do not leave the house in v1.

**What is sent to a model.** v1 runs only local models on the Mac mini. Conversation, retrieved memories the user asked the radio to remember, and tool results stay on the Mac mini. Habit records stay on the Mac mini.

Proactive jobs in v1:

* **Morning broadcast:** weather, Google Calendar and news, then the radio is turned on.
* **Background watch:** “tell me when …”
* **Context-aware reminders.**
* **Proactive suggestions** from memory.
* **Multi-step research.**
* **Evening summary.**

These jobs run on a local scheduler on the Mac mini by default. Quiet hours and the unprompted cap are the decided rule in section 2.

---

## 7. Web admin

Decided for v1. Framework: Next.js. Host: the Mac mini. Access: Tailscale. Being on the tailnet is not enough.

Sign-in requires proof of identity: the Tailscale identity of an allowlisted user, verified server-side, plus an app session. Verified server-side means the service checks that identity with `tailscale whois` or `tailscale serve`, and never trusts a client-supplied header. The allowlist is a list of users, not a shared or tagged device. A tailnet ACL limits who can reach the admin port. Sign-in without that proof is refused. Sessions are server-side, with expiry and logout. CSRF protection applies to every state-changing request.

The service binds to the tailnet interface or localhost only. It does not listen on the LAN or on a public address. Tailscale Funnel is not used for the admin.

The user can:

* onboard and pair the device (Wi-Fi, device linking, and the pairing key)
* rotate the pairing key; re-pairing revokes the old key
* manage keys and connections, such as Google Calendar
* view and edit what the radio remembers about the user
* manage watches and reminders
* pick favourite radio stations

Secrets are handled server-side or encrypted. They never go into the public repository, into client-side source that is committed, or onto the screen in cleartext. Memory stays at home.

Connection status is visible. Turning autonomous behaviour off belongs with memory and watches.

The accepted skeleton (PR #21 / PAN-289) assumed a Pi device code, keys encrypted to a key that only the Pi holds, and later a hosted web admin. That work is stopped. The issue is rescoped to this admin.

User-facing admin text is English in v1. Swedish comes later as a language option.

---

## 8. Privacy, security and providers

The repo stays public. No secrets, pairing keys or personal data in code.

**Local only (decided).** Local models are the rule in section 6. No speech leaves the house. Audio goes from the ESP32-S3 over the home network to the Mac mini, and is processed there. Memory stays in local Postgres. Under the GDPR, Radio Days processes this household data on a machine in the home for the purpose of running the radio for that household. QA uses fake keys and mocks only. A provider key alone does not start a paid call.

**At rest.** Memory and secrets are encrypted at rest on the Mac mini. A backup of memory is encrypted. No unencrypted copy of memory is kept off the Mac mini.

**Logs.** Logs must not contain raw audio, transcripts, prompts, user text, or secrets.

**Web search.** Own SearXNG keeps queries in the house (section 2.1).

**Untrusted text (PAN-297).** Calendar invitations and events, and web search results, are never treated as instructions and can never start an action. The radio starts a station only from the user’s saved favourites or a curated allowlist of stream URLs, never from a URL taken from search results or other untrusted text. The same rule will apply to email content when email returns in v2 (section 2.2).

---

## 9. Latency

**Gate (decided):** at most 3 seconds from when the user stops speaking until the first audio on the cassette player’s speaker. It is measured against the Mac mini, with the ESP32-S3 on the home network, not in CI. For a turn that needs a tool, that first audio may be a short spoken acknowledgement, and the answer follows.

The accepted measurement in PAN-300 was on a Pi 4. That setup is obsolete. PAN-300 is rescoped to this Mac mini plus ESP32-S3 measurement (section 13). The same measurement records whether STT, Qwen 2.5 7B or Llama 3.1 8B, and Piper or Kokoro can run together in 16 GB, and how the English quality and tool calling hold up. Those results do not change the 3 second gate; they tell us whether the default stack meets it.

---

## 10. Running cost

**Local models (Daniel, 2026-11-27).** Local models are the rule in section 6. Local STT, the local model, local Piper or Kokoro, local Postgres, the local scheduler, the Next.js admin on the Mac mini, and own SearXNG have no hosted fee.

A token cap per conversation remains. A provider key alone does not start a paid call.

---

## 11. Plan (milestones, no fixed timeline)

The plan takes the time it takes. Each milestone is done only when its done criterion is met, and the work is covered by unit tests, with CI green. Mounting in the cassette player waits for the separate component list and for a set Daniel has. The provider interface is part of the work from the first milestone, so a local part can be swapped without a rewrite.

**Milestone 1: Wake word and voice chat**

On-chip microWakeWord with a ready-made English wake word for the first demo (for example “Hey Jarvis”). A custom wake word (“Kör Radio”) and Swedish come later. Audio streams over the local WebSocket, with mDNS (`radio-days.local`) or a fixed IP. Pairing and the audio stream are the rule in section 5. Default local chain: Whisper or Parakeet, English; Qwen 2.5 7B or Llama 3.1 8B with tool calling; and Piper with an English voice, or Kokoro. After the wake word, the user can have a short spoken conversation and hear the reply from the speaker. A token cap is in place. Raw audio and transcripts are not stored. Done when that conversation works from the ESP32-S3 against the Mac mini (a bench prototype is enough). Covered by unit tests, CI green.

**Milestone 2: Web admin and pairing**

Next.js admin served from the Mac mini. Sign-in, binding, CSRF, and admin text are the rule in section 7. Onboard and pair the device, keys and connections such as Google Calendar, status, favourite stations. Secrets handled server-side or encrypted, never in the public code. Memory stays at home. Done when the user can sign in, put the device on Wi-Fi, pair it, and set connections, without secrets appearing in cleartext or in the repo. Covered by unit tests, CI green.

**Milestone 3: Memory**

Postgres with pgvector on the Mac mini, behind the provider interface. Encryption at rest and the memory backup are the rule in section 8. The radio remembers what it is told and what it has learned, and can use that in a later turn. A habit is stored only after the user agrees. The user can view and edit memory in the admin and by voice. Deletion is effective. Done when those behaviours hold and memory is not leaked into the repo or into logs. Covered by unit tests, CI green.

**Milestone 4: Web search, web radio, and calendar**

Web search as a tool, via own SearXNG (section 2.1). The user can ask a question and hear an answer in English, and can start web radio or music (“turn on P1”), including a favourite station. Station start is the rule in section 8. The morning broadcast can read Google Calendar. Search results and calendar text are untrusted. Done when those behaviours hold. Covered by unit tests, CI green.

**Milestone 5: Proactive agent jobs**

Morning broadcast (weather, Google Calendar, news, then radio on), background watches, context-aware reminders, suggestions from memory, multi-step research, and evening summary, run by the local scheduler. Quiet hours and the unprompted cap are the decided rule in section 2. Done when those jobs run on a schedule and can be managed in the admin. Covered by unit tests, CI green.

**Milestone 6: Evals, latency and the default stack**

Evals for intent-to-tool, memory recall, invention and deletion, untrusted text, consent (no habit stored without agreement), and privacy leaks (including speech leaving the house). CI runs those evals with mocks. Latency is measured on the ESP32-S3 plus the Mac mini, not only in CI, against the 3 second gate. The same measurement records English quality and tool calling for Qwen 2.5 7B or Llama 3.1 8B, and whether STT, the model and TTS fit together in 16 GB. Done when CI turns red on a planted failure in the test set, and green again when it is fixed, and when the latency measurement is written down. Covered by unit tests, CI green.

**v2 (after v1):** email by voice, with an unlock step before content is read aloud, and a physical approval button for sending mail; email text remains untrusted and can never start an action (PAN-302, PAN-307). Choosing the wake word from a list in the web admin (PAN-301). A custom wake word (“Kör Radio”) and Swedish as a language option, including KB-Whisper for Swedish speech-to-text, via the swappable providers. Spotify only with written permission, and with undo for playlist and favourite changes.

---

## 12. Process and workflow

Unchanged from the accepted spec:

* `AGENTS.md` stays the short project guide. Confirm work with `npm run check` before calling work done. Tests of SPEC.md and docs check structure and a few short key facts per section. A safety limit is the whole sentence or the exact value, in the section that owns it. Each locked fact is written once there. Tests do not count occurrences, and they do not check section numbers or words that must not appear.
* Daniel builds in Cursor and opens a PR. Vera (code review) and Lazek (QA, same sha) review every PR and post a verdict in the PR. Only Daniel merges.
* Every branch and PR title contains the Linear issue id, except this spec revision, whose branch name was set for the change of direction; PAN-267 tracks the spec.
* Live model calls with real keys only with Daniel’s yes, and only with an explicit `--live` opt-in. QA uses fake keys and mocks only.
* Secrets never go in chat or code. Migrations run only from `main`, after Daniel’s ok.
* Cursor agents use model grok-4.7.

PR #20 (PAN-308) will be merged by Daniel and then adapted to this revision. PR #21 (PAN-289) is stopped.

---

## 13. Impact on in-flight work

These changes follow Daniel’s decisions of 2026-11-27.

| Item | Status now | Decision |
| -- | -- | -- |
| [PR #20](https://github.com/PanamaDonne/radio-days/pull/20) / [PAN-308](https://linear.app/panamadonnes/issue/PAN-308/kor-milstolpe-1-pa-datorn-innan-pi-4-finns) | Approved, CI green, awaiting Daniel’s merge | **Merge, then adapt.** Daniel merges. After merge, the Pi 4 destination is removed and the loop is pointed at the Mac mini default |
| [PR #21](https://github.com/PanamaDonne/radio-days/pull/21) / [PAN-289](https://linear.app/panamadonnes/issue/PAN-289/webbadmin-skelett) | In review; custom Node `serve.ts`, in-memory store, Pi ciphertext model | **Stopped.** The stack does not fit. PAN-289 is rescoped to Next.js on the Mac mini (section 7) |
| [PAN-300](https://linear.app/panamadonnes/issue/PAN-300/mat-svensk-rost-pa-pi-4-med-1-gb-och-2-gb) | Backlog | **Rescope** to the 3 second measurement on the ESP32-S3 plus the Mac mini, including 16 GB concurrency and English quality and tool calling for Qwen 2.5 7B or Llama 3.1 8B |
| [PAN-306](https://linear.app/panamadonnes/issue/PAN-306/valj-eu-chattleverantor-for-v1) | Backlog | **Outside this spec.** Local models are the rule in section 6 |
| [PAN-307](https://linear.app/panamadonnes/issue/PAN-307/valj-upplasningsmetod-for-upplasning-av-mejl), [PAN-302](https://linear.app/panamadonnes/issue/PAN-302/mejl-med-rosten) | Backlog | **Out of v1.** Email returns in v2 (section 2.2). Not cancelled |
| [PAN-303](https://linear.app/panamadonnes/issue/PAN-303/kalender-med-rosten) | Backlog | **Rescope.** Calendar stays in v1 for the morning broadcast and as a Google Calendar connection in the admin |
| [PAN-304](https://linear.app/panamadonnes/issue/PAN-304/webbsokning-med-rosten) | Backlog | **Widen** so the same tool can start web radio or music, via own SearXNG (section 2.1) |
| [PAN-305](https://linear.app/panamadonnes/issue/PAN-305/sparade-favoriter-och-cache-for-webbradio-och-poddar-efter-v1) | Backlog, previously after v1 | **Rescope into v1** for favourite stations. Podcast cache can stay later |
| [PAN-288](https://linear.app/panamadonnes/issue/PAN-288/spotify-med-rosten-uppskjuten-ej-v1) | Backlog, already not in v1 | **Keep out of v1.** If it returns: written permission, and undo for playlist and favourite changes |
| [PAN-287](https://linear.app/panamadonnes/issue/PAN-287/vackningsord-och-samtal) | Backlog | **Rescope** to on-chip microWakeWord with a ready-made English wake word and the Mac mini voice chain, behind the provider interface |
| [PAN-291](https://linear.app/panamadonnes/issue/PAN-291/langtidsminne) | Backlog | **Rescope** to Postgres with pgvector on the Mac mini |
| [PAN-292](https://linear.app/panamadonnes/issue/PAN-292/evals-och-ci-sparr) | Backlog | **Rescope.** Latency is measured on the Mac mini plus the ESP32-S3. Privacy evals cover local mode |
| [PAN-301](https://linear.app/panamadonnes/issue/PAN-301/valj-vackningsord-i-webbadmin-v2) | Backlog | **Keep after v1** |
| [PAN-295](https://linear.app/panamadonnes/issue/PAN-295/tata-luckor-i-specmd-och-agentsmd-efter-tts-beslutet), [PAN-294](https://linear.app/panamadonnes/issue/PAN-294/komplettera-tts-reserven-i-specen-och-gor-spec-testet-taligt) | Backlog | **Rescope.** Piper with an English voice, or Kokoro, is the v1 TTS |
| [PAN-297](https://linear.app/panamadonnes/issue/PAN-297/tata-luckor-i-agentavsnittet-i-specmd-efter-pr-16) | Backlog | **Absorbed in this revision** and marked Done |
| [PAN-299](https://linear.app/panamadonnes/issue/PAN-299/specen-billig-pi-4-med-lokal-svensk-rost) | Done | **Superseded** as a hardware decision. Leave the issue done |
| [PAN-269](https://linear.app/panamadonnes/issue/PAN-269/skills-synken-skriver-aldrig-utanfor-cursorskills), [PAN-270](https://linear.app/panamadonnes/issue/PAN-270/skills-synk-skriver-aldrig-utanfor-cursorskills-aven-vid-symlankade) | Backlog | **Keep.** Repo hygiene |
| PAN-309 | New | **In v1.** ESP32-S3 WebSocket, mDNS or a fixed IP. Pairing is the rule in section 5 |
| PAN-310 | New | **In v1.** A common provider interface for local models (section 5) |
| PAN-311 | New | **In v1.** Local scheduler on the Mac mini |
| PAN-312 | New | **In v1.** The decided quiet-hours and unprompted rule in section 2 |
| PAN-313 | New | **After v1.** Swedish is a language option via the swappable providers, including KB-Whisper |

`README.md` and `AGENTS.md` are updated in this revision to the ESP32-S3, the Mac mini, and the v1 language in section 2.2.

---

## 14. Measurement, not an open product decision

The product decisions in this revision are closed.

One measurement remains, and does not reopen those decisions. It is owned by milestone 6 and by the rescoped PAN-300:

* Is Qwen 2.5 7B or Llama 3.1 8B good enough in English with tool calling, and can STT, the model and Piper or Kokoro run at the same time in 16 GB on the Mac mini while still meeting the 3 second gate?

If the measurement misses the gate, a later change to the default model or the runtime (Ollama versus MLX, or Whisper versus Parakeet) can be proposed then. This file does not choose a smaller or larger model in advance.

The component list for the radio comes separately and is not decided here.
